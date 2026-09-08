const express = require('express');
const router = express.Router();
const db = require('../database');
const { calculatePackages } = require('../services/packagingEngine');
const { quoteFreight } = require('../services/freightService');

function getShipmentSessionId(req) {
  if (req.clientId) return `cart_client_${req.clientId}`;
  if (req.user && req.user.id) return `cart_client_${req.user.id}`;
  return 'default_session';
}

// 1. Calcular volumes/embalagens físicas para os itens do carrinho ou lista fornecida
router.post('/calculate-packages', (req, res) => {
  const sessionId = getShipmentSessionId(req);
  // Buscar itens do carrinho do banco de dados
  const query = `
    SELECT 
      c.quantity,
      p.id, p.code, p.name, p.unit_weight, p.unit_height, p.unit_width, p.unit_length,
      pr.max_qty_per_box, pr.box_weight, pr.box_height, pr.box_width, pr.box_length
    FROM cart_items c
    JOIN products p ON c.product_id = p.id
    LEFT JOIN packaging_rules pr ON p.id = pr.product_id
    WHERE c.session_id = ?
  `;

  db.all(query, [sessionId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'O carrinho de envio está vazio.' });
    }

    const itemsWithRules = rows.map(r => ({
      product: {
        id: r.id,
        code: r.code,
        name: r.name,
        unit_weight: r.unit_weight,
        unit_height: r.unit_height,
        unit_width: r.unit_width,
        unit_length: r.unit_length
      },
      rule: {
        max_qty_per_box: r.max_qty_per_box || 1,
        box_weight: r.box_weight || 0.2,
        box_height: r.box_height || 10,
        box_width: r.box_width || 10,
        box_length: r.box_length || 10
      },
      quantity: r.quantity
    }));

    const result = calculatePackages(itemsWithRules);
    res.json(result);
  });
});

// 2. Realizar Cotação de Frete (com margem de lucro aplicada)
router.post('/quote', async (req, res) => {
  const { dest_cep, packages, markup_percent } = req.body;

  if (!dest_cep) {
    return res.status(400).json({ error: 'CEP de destino é obrigatório para cotar frete.' });
  }

  // Buscar CEP de origem e margem das configurações se não passados
  db.all("SELECT key, value FROM settings WHERE key IN ('origin_cep', 'default_markup_percent')", async (err, settingsRows) => {
    if (err) return res.status(500).json({ error: err.message });

    const settingsMap = {};
    settingsRows.forEach(row => { settingsMap[row.key] = row.value; });

    const originCep = settingsMap.origin_cep || '80000000';
    const effectiveMarkup = markup_percent !== undefined ? markup_percent : (parseFloat(settingsMap.default_markup_percent) || 10.0);

    let packagesToQuote = packages;

    // Se pacotes não foram passados no payload, calcula automaticamente a partir do carrinho
    if (!packagesToQuote || !Array.isArray(packagesToQuote) || packagesToQuote.length === 0) {
      try {
        const sessionId = getShipmentSessionId(req);
        const rows = await new Promise((resolve, reject) => {
          const query = `
            SELECT 
              c.quantity,
              p.id, p.code, p.name, p.unit_weight, p.unit_height, p.unit_width, p.unit_length,
              pr.max_qty_per_box, pr.box_weight, pr.box_height, pr.box_width, pr.box_length
            FROM cart_items c
            JOIN products p ON c.product_id = p.id
            LEFT JOIN packaging_rules pr ON p.id = pr.product_id
            WHERE c.session_id = ?
          `;
          db.all(query, [sessionId], (err, r) => err ? reject(err) : resolve(r));
        });

        if (!rows || rows.length === 0) {
          return res.status(400).json({ error: 'Sem itens no carrinho para cotar.' });
        }

        const itemsWithRules = rows.map(r => ({
          product: { id: r.id, code: r.code, name: r.name, unit_weight: r.unit_weight },
          rule: {
            max_qty_per_box: r.max_qty_per_box || 1,
            box_weight: r.box_weight || 0.2,
            box_height: r.box_height || 10,
            box_width: r.box_width || 10,
            box_length: r.box_length || 10
          },
          quantity: r.quantity
        }));

        const calc = calculatePackages(itemsWithRules);
        packagesToQuote = calc.packages;
      } catch (calcErr) {
        return res.status(500).json({ error: calcErr.message });
      }
    }

    try {
      const quotes = await quoteFreight({
        originCep,
        destCep: dest_cep,
        packages: packagesToQuote,
        markupPercent: effectiveMarkup
      });

      res.json({
        origin_cep: originCep,
        dest_cep: dest_cep,
        packages: packagesToQuote,
        total_volumes: packagesToQuote.length,
        total_weight: parseFloat(packagesToQuote.reduce((a, b) => a + b.weight, 0).toFixed(3)),
        quotes
      });
    } catch (quoteErr) {
      res.status(500).json({ error: quoteErr.message });
    }
  });
});

// 3. Salvar Solicitação de Envio (Criar Ordem de Envio)
router.post('/', (req, res) => {
  const {
    type,
    recipient_name,
    dest_cep,
    dest_address,
    dest_city,
    dest_state,
    dest_number,
    dest_complement,
    selected_carrier,
    selected_service,
    quoted_freight_cost,
    markup_percent,
    final_freight_price,
    delivery_days,
    packages,
    cart_items,
    client_id
  } = req.body;

  const sessionId = getShipmentSessionId(req);
  let targetClientId = req.isClient ? req.clientId : (client_id || req.headers['x-target-client-id'] || null);

  if (!dest_cep) {
    return res.status(400).json({ error: 'CEP de destino é obrigatório.' });
  }

  const code = 'FLOW-' + Date.now().toString(36).toUpperCase();

  const insertShipment = `
    INSERT INTO shipments (
      client_id, code, type, recipient_name, dest_cep, dest_address, dest_city, dest_state,
      dest_number, dest_complement, total_weight, total_volumes, selected_carrier,
      selected_service, quoted_freight_cost, markup_percent, final_freight_price,
      delivery_days, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const totalWeight = packages ? packages.reduce((acc, p) => acc + p.weight, 0) : 0;
  const totalVolumes = packages ? packages.length : 0;

  const executeShipmentInsert = (effectiveClientId) => {
    db.run(
      insertShipment,
      [
        effectiveClientId,
        code,
        type || 'coletivo',
        recipient_name || '',
        dest_cep,
        dest_address || '',
        dest_city || '',
        dest_state || '',
        dest_number || '',
        dest_complement || '',
        totalWeight,
        totalVolumes,
        selected_carrier || '',
        selected_service || '',
        quoted_freight_cost || 0,
        markup_percent || 10.0,
        final_freight_price || 0,
        delivery_days || 0,
        'quoted'
      ],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const shipmentId = this.lastID;

      // Salvar Pacotes e Itens com garantia de conclusão antes de responder a requisição
      const itemPromises = [];

      if (packages && Array.isArray(packages)) {
        const insertPackage = `
          INSERT INTO shipment_packages (shipment_id, volume_number, product_id, weight, height, width, length)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        packages.forEach(p => {
          itemPromises.push(new Promise((resolve, reject) => {
            db.run(insertPackage, [shipmentId, p.volume_number, p.product_id || null, p.weight, p.height, p.width, p.length], (err) => {
              if (err) reject(err);
              else resolve();
            });
          }));
        });
      }

      const runFinalization = (itemsToProcess) => {
        if (itemsToProcess && Array.isArray(itemsToProcess)) {
          const insertItemSql = `INSERT INTO shipment_items (shipment_id, product_id, quantity) VALUES (?, ?, ?)`;
          const updateStockSql = `UPDATE products SET stock_qty = MAX(0, COALESCE(stock_qty, 0) - ?) WHERE id = ?`;

          const qtyByProduct = {};

          itemsToProcess.forEach(item => {
            const prodId = parseInt(item.product_id || item.id, 10);
            const qty = parseInt(item.quantity, 10) || 1;
            if (prodId && !isNaN(prodId)) {
              qtyByProduct[prodId] = (qtyByProduct[prodId] || 0) + qty;
              itemPromises.push(new Promise((resolve, reject) => {
                db.run(insertItemSql, [shipmentId, prodId, qty], (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              }));
            }
          });

          // Abater o estoque acumulado por produto de forma atômica (garantindo prodId numérico para o SQLite)
          Object.keys(qtyByProduct).forEach(prodKey => {
            const numericProdId = parseInt(prodKey, 10);
            const totalQty = qtyByProduct[prodKey];
            itemPromises.push(new Promise((resolve, reject) => {
              db.run(updateStockSql, [totalQty, numericProdId], function (err) {
                if (err) {
                  console.error(`❌ Erro ao atualizar estoque do produto ${numericProdId}:`, err.message);
                  reject(err);
                } else {
                  console.log(`✅ Estoque do produto ID ${numericProdId} reduzido em ${totalQty} un. Linhas alteradas: ${this.changes}`);
                  resolve();
                }
              });
            }));
          });
        }

        Promise.all(itemPromises).then(() => {
          db.run('DELETE FROM cart_items WHERE session_id = ?', [sessionId], (err) => {
            if (err) {
              console.error('Erro ao limpar carrinho após remessa:', err.message);
            }
            res.status(201).json({
              message: 'Solicitação de envio gerada com sucesso!',
              shipment_id: shipmentId,
              code
            });
          });
        }).catch(pErr => {
          console.error('Erro na gravação de pacotes/itens da remessa:', pErr.message);
          res.status(500).json({ error: pErr.message });
        });
      };

      if (cart_items && Array.isArray(cart_items) && cart_items.length > 0) {
        runFinalization(cart_items);
      } else {
        db.all('SELECT product_id, quantity FROM cart_items WHERE session_id = ?', [sessionId], (err, cartRows) => {
          if (err) {
            console.error('Erro ao buscar itens do carrinho para remessa:', err.message);
            runFinalization([]);
          } else {
            runFinalization(cartRows || []);
          }
        });
      }
    }
  );
};

  if (!targetClientId) {
    const itemsToCheck = cart_items || [];
    const firstProdId = itemsToCheck.length > 0 ? (itemsToCheck[0].product_id || itemsToCheck[0].id) : null;

    if (firstProdId) {
      db.get("SELECT client_id FROM products WHERE id = ?", [firstProdId], (err, pRow) => {
        const resolvedId = (!err && pRow && pRow.client_id) ? pRow.client_id : null;
        executeShipmentInsert(resolvedId);
      });
    } else {
      db.get("SELECT p.client_id FROM cart_items c JOIN products p ON c.product_id = p.id WHERE c.session_id = ? AND p.client_id IS NOT NULL LIMIT 1", [sessionId], (err, pRow) => {
        const resolvedId = (!err && pRow && pRow.client_id) ? pRow.client_id : null;
        executeShipmentInsert(resolvedId);
      });
    }
  } else {
    executeShipmentInsert(targetClientId);
  }
});

// 4. Listar solicitações de envio (suporta filtro por client_id e isolamento multi-tenant)
router.get('/', (req, res) => {
  let query = `
    SELECT 
      s.*,
      c.name AS client_name,
      c.email AS client_email
    FROM shipments s
    LEFT JOIN clients c ON s.client_id = c.id
  `;
  const params = [];

  const filterClientId = req.isClient ? req.clientId : (req.query.client_id ? parseInt(req.query.client_id, 10) : req.clientId);

  if (filterClientId) {
    query += ' WHERE s.client_id = ?';
    params.push(filterClientId);
  }

  query += ' ORDER BY s.created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// 5. Obter detalhes da solicitação de envio (incluindo pacotes e itens)
router.get('/:id', (req, res) => {
  const shipmentId = req.params.id;

  const shipmentSql = `
    SELECT 
      s.*,
      c.name AS client_name,
      c.email AS client_email,
      c.cnpj_cpf AS client_cnpj_cpf,
      c.phone AS client_phone
    FROM shipments s
    LEFT JOIN clients c ON s.client_id = c.id
    WHERE s.id = ?
  `;

  db.get(shipmentSql, [shipmentId], (err, shipment) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!shipment) return res.status(404).json({ error: 'Solicitação de envio não encontrada.' });

    if (req.isClient && shipment.client_id !== req.clientId) {
      return res.status(403).json({ error: 'Você não tem permissão para visualizar esta remessa.' });
    }

    // Buscar Pacotes/Volumes
    db.all('SELECT * FROM shipment_packages WHERE shipment_id = ? ORDER BY volume_number ASC', [shipmentId], (pkgErr, packages) => {
      if (pkgErr) return res.status(500).json({ error: pkgErr.message });

      // Buscar Itens
      const itemsQuery = `
        SELECT si.*, p.code as product_code, p.name as product_name, p.image_url
        FROM shipment_items si
        JOIN products p ON si.product_id = p.id
        WHERE si.shipment_id = ?
      `;

      db.all(itemsQuery, [shipmentId], (itemErr, items) => {
        if (itemErr) return res.status(500).json({ error: itemErr.message });

        res.json({
          shipment,
          packages,
          items
        });
      });
    });
  });
});

// 6. ADMINISTRADOR: Sobrescrever Manualmente Volumes/Embalagens (Regra 9 do Escopo)
router.put('/:id/override-packages', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Apenas administradores podem ajustar volumes manualmente.' });
  }

  const shipmentId = req.params.id;
  const { packages } = req.body; // Array de novos volumes ajustados pelo admin

  if (!packages || !Array.isArray(packages) || packages.length === 0) {
    return res.status(400).json({ error: 'Informe ao menos 1 volume válido.' });
  }

  // Deletar pacotes antigos e inserir os novos ajustados pelo admin
  db.run('DELETE FROM shipment_packages WHERE shipment_id = ?', [shipmentId], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    const insertPackage = `
      INSERT INTO shipment_packages (shipment_id, volume_number, product_id, weight, height, width, length)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    packages.forEach((p, idx) => {
      db.run(insertPackage, [
        shipmentId,
        idx + 1,
        p.product_id || null,
        parseFloat(p.weight) || 0.1,
        parseFloat(p.height) || 10,
        parseFloat(p.width) || 10,
        parseFloat(p.length) || 10
      ]);
    });

    const newTotalVolumes = packages.length;
    const newTotalWeight = parseFloat(packages.reduce((acc, p) => acc + (parseFloat(p.weight) || 0), 0).toFixed(3));

    // Atualizar tabela principal de shipments
    const updateShipment = `
      UPDATE shipments SET
        total_volumes = ?,
        total_weight = ?,
        is_manual_override = 1
      WHERE id = ?
    `;

    db.run(updateShipment, [newTotalVolumes, newTotalWeight, shipmentId], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      res.json({
        message: 'Volumes ajustados manualmente pelo Administrador!',
        total_volumes: newTotalVolumes,
        total_weight: newTotalWeight
      });
    });
  });
});

// 7. Atualizar status da solicitação (Separação, A caminho, Entregue) e Rastreio
router.put('/:id/status', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Apenas administradores podem alterar o status de remessas.' });
  }

  const shipmentId = req.params.id;
  const { status, tracking_code } = req.body;

  const validStatuses = ['draft', 'quoted', 'separacao', 'em_preparacao', 'a_caminho', 'dispatched', 'entregue', 'delivered'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  const updates = [];
  const params = [];

  if (status) {
    updates.push('status = ?');
    params.push(status);
  }

  if (tracking_code !== undefined) {
    updates.push('tracking_code = ?');
    params.push(tracking_code);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  }

  params.push(shipmentId);

  db.run(`UPDATE shipments SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Remessa atualizada com sucesso!', status, tracking_code });
  });
});

// 8. Excluir remessa / cobrança (Admin Only)
router.delete('/:id', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Apenas administradores podem excluir remessas e cobranças.' });
  }

  const shipmentId = parseInt(req.params.id, 10);
  if (isNaN(shipmentId)) {
    return res.status(400).json({ error: 'ID de remessa inválido.' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM shipment_packages WHERE shipment_id = ?', [shipmentId]);
    db.run('DELETE FROM shipment_items WHERE shipment_id = ?', [shipmentId]);
    db.run('DELETE FROM shipments WHERE id = ?', [shipmentId], function (err) {
      if (err) {
        db.run('ROLLBACK');
        console.error('Erro ao excluir remessa:', err);
        return res.status(500).json({ error: 'Erro ao excluir remessa do banco de dados.' });
      }

      db.run('COMMIT', (commitErr) => {
        if (commitErr) {
          console.error('Erro ao confirmar exclusão de remessa:', commitErr);
          return res.status(500).json({ error: 'Erro ao confirmar exclusão da remessa.' });
        }
        res.json({ success: true, message: 'Remessa/Cobrança excluída com sucesso!' });
      });
    });
  });
});

module.exports = router;
