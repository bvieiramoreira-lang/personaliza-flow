const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database');

// Configuração do Multer para Upload de Notas Fiscais (NF) e Boletos
const fiscalStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads/fiscal');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.pdf';
    const prefix = file.fieldname === 'boleto_file' ? 'boleto-' : 'nf-';
    cb(null, prefix + uniqueSuffix + ext);
  }
});

const uploadFiscal = multer({ storage: fiscalStorage });

// 1. Resumo Financeiro (Total em Aberto, Total Pago, Contadores) - Somente pedidos aprovados (status != 'em_aberto')
router.get('/summary', (req, res) => {
  let query = `
    SELECT 
      COALESCE(SUM(CASE WHEN payment_status = 'pago' THEN final_freight_price ELSE 0 END), 0) as total_pago,
      COALESCE(SUM(CASE WHEN payment_status IS NULL OR payment_status != 'pago' THEN final_freight_price ELSE 0 END), 0) as total_em_aberto,
      COUNT(CASE WHEN payment_status IS NULL OR payment_status != 'pago' THEN 1 END) as count_em_aberto,
      COUNT(CASE WHEN payment_status = 'pago' THEN 1 END) as count_pago
    FROM shipments
    WHERE status NOT IN ('draft', 'em_aberto')
  `;
  const params = [];

  if (req.isClient) {
    if (!req.parentClientId) {
      query += ` AND (client_id = ? OR parent_client_id = ? OR billing_client_id = ?)`;
      params.push(req.clientId, req.clientId, req.clientId);
    } else {
      query += ` AND (client_id = ? OR billing_client_id = ?)`;
      params.push(req.clientId, req.clientId);
    }
  } else if (req.clientId) {
    query += ` AND (client_id = ? OR parent_client_id = ? OR billing_client_id = ?)`;
    params.push(req.clientId, req.clientId, req.clientId);
  }

  db.get(query, params, (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(row || {});
  });
});

// 2. Listar Todos os Envios Aprovados com Status de Pagamento, NF e Boleto
router.get('/shipments', (req, res) => {
  let query = `
    SELECT 
      s.id,
      s.code,
      s.client_id,
      s.parent_client_id,
      s.billing_client_id,
      s.billing_cnpj,
      s.billing_name,
      c.name as client_name,
      c.branch_number as client_branch,
      c.cnpj_cpf as client_cnpj,
      s.recipient_name,
      s.dest_city,
      s.dest_state,
      s.selected_carrier,
      s.selected_service,
      s.final_freight_price,
      s.total_volumes,
      s.total_weight,
      s.status as shipment_status,
      COALESCE(s.payment_status, 'em_aberto') as payment_status,
      s.billing_id,
      s.nf_url,
      s.nf_number,
      s.boleto_url,
      s.billed_at,
      s.created_at
    FROM shipments s
    LEFT JOIN clients c ON s.client_id = c.id
    WHERE s.status NOT IN ('draft', 'em_aberto')
  `;
  const params = [];

  if (req.isClient) {
    if (!req.parentClientId) {
      query += ` AND (s.client_id = ? OR s.parent_client_id = ? OR s.billing_client_id = ?)`;
      params.push(req.clientId, req.clientId, req.clientId);
    } else {
      query += ` AND (s.client_id = ? OR s.billing_client_id = ?)`;
      params.push(req.clientId, req.clientId);
    }
  } else if (req.query.client_id) {
    const cid = parseInt(req.query.client_id, 10);
    query += ` AND (s.client_id = ? OR s.parent_client_id = ? OR s.billing_client_id = ?)`;
    params.push(cid, cid, cid);
  } else if (req.clientId) {
    query += ` AND (s.client_id = ? OR s.parent_client_id = ? OR s.billing_client_id = ?)`;
    params.push(req.clientId, req.clientId, req.clientId);
  }

  query += ` ORDER BY s.created_at DESC`;

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// 3. Listar Faturas / Fechamentos Quinzenais
router.get('/invoices', (req, res) => {
  let query = `SELECT * FROM billing_invoices`;
  const params = [];

  if (req.isClient) {
    query += ` WHERE client_id = ?`;
    params.push(req.clientId);
  } else if (req.clientId) {
    query += ` WHERE client_id = ?`;
    params.push(req.clientId);
  }

  query += ` ORDER BY created_at DESC`;

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// 4. Gerar Fechamento Quinzenal (Admin)
router.post('/close-cycle', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }

  // Buscar todas as remessas em aberto (não rascunhos e não pagas)
  const findOpenQuery = `
    SELECT id, final_freight_price 
    FROM shipments 
    WHERE status != 'draft' AND (payment_status IS NULL OR payment_status != 'pago') AND billing_id IS NULL
  `;

  db.all(findOpenQuery, [], (err, openShipments) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!openShipments || openShipments.length === 0) {
      return res.status(400).json({ error: 'Nenhuma remessa em aberto disponível para fechamento.' });
    }

    const totalAmount = openShipments.reduce((acc, item) => acc + (item.final_freight_price || 0), 0);
    const shipmentsQty = openShipments.length;
    const shipmentIds = openShipments.map(s => s.id);

    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR');
    const invoiceCode = `FAT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const periodLabel = `Fechamento Quinzenal - ${formattedDate}`;
    
    // Vencimento em 3 dias úteis
    const dueDateObj = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const dueDate = dueDateObj.toLocaleDateString('pt-BR');

    const insertInvoice = `
      INSERT INTO billing_invoices (code, period_label, total_amount, shipments_qty, status, due_date, notes)
      VALUES (?, ?, ?, ?, 'em_aberto', ?, ?)
    `;

    db.run(insertInvoice, [invoiceCode, periodLabel, totalAmount, shipmentsQty, dueDate, 'Boleto faturamento quinzenal - Pagamento via chave PIX / Boleto bancário'], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const invoiceId = this.lastID;

      // Vincular as remessas à fatura criada
      const placeholders = shipmentIds.map(() => '?').join(',');
      const updateShipments = `UPDATE shipments SET billing_id = ? WHERE id IN (${placeholders})`;

      db.run(updateShipments, [invoiceId, ...shipmentIds], (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ error: updateErr.message });
        }

        res.json({
          message: 'Fechamento quinzenal gerado com sucesso!',
          invoice: {
            id: invoiceId,
            code: invoiceCode,
            total_amount: totalAmount,
            shipments_qty: shipmentsQty,
            due_date: dueDate
          }
        });
      });
    });
  });
});

// 5. Dar Baixa em Fatura Inteira (Admin)
router.post('/invoices/:id/pay', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }

  const invoiceId = req.params.id;

  db.serialize(() => {
    db.run(
      `UPDATE billing_invoices SET status = 'pago', paid_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [invoiceId],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        // Marcar todas as remessas vinculadas como pagas
        db.run(
          `UPDATE shipments SET payment_status = 'pago' WHERE billing_id = ?`,
          [invoiceId],
          (shipErr) => {
            if (shipErr) {
              return res.status(500).json({ error: shipErr.message });
            }

            res.json({ message: 'Baixa efetuada com sucesso! Fatura e remessas marcadas como pagas.' });
          }
        );
      }
    );
  });
});

// 6. Atualizar Status de Pagamento (Individual ou Lote) (Admin)
router.post('/shipments/update-status', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }

  const { shipment_ids, payment_status } = req.body;

  if (!shipment_ids || !Array.isArray(shipment_ids) || shipment_ids.length === 0) {
    return res.status(400).json({ error: 'Nenhum pedido selecionado.' });
  }

  if (!['em_aberto', 'aguardando_pagamento', 'pago'].includes(payment_status)) {
    return res.status(400).json({ error: 'Status de pagamento inválido.' });
  }

  const placeholders = shipment_ids.map(() => '?').join(',');
  const query = `UPDATE shipments SET payment_status = ? WHERE id IN (${placeholders})`;

  const statusLabels = {
    pago: 'Pago',
    aguardando_pagamento: 'Aguard. Pagamento',
    em_aberto: 'Em Aberto'
  };

  db.run(query, [payment_status, ...shipment_ids], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json({
      message: `Status atualizado para "${statusLabels[payment_status] || payment_status}" em ${this.changes} pedido(s).`,
      updatedCount: this.changes
    });
  });
});

// 7. Excluir Lançamentos / Remessas em Lote (Admin)
router.post('/shipments/batch-delete', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }

  const { shipment_ids } = req.body;

  if (!shipment_ids || !Array.isArray(shipment_ids) || shipment_ids.length === 0) {
    return res.status(400).json({ error: 'Nenhum lançamento selecionado para exclusão.' });
  }

  const placeholders = shipment_ids.map(() => '?').join(',');

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run(`DELETE FROM shipment_packages WHERE shipment_id IN (${placeholders})`, shipment_ids);
    db.run(`DELETE FROM shipment_items WHERE shipment_id IN (${placeholders})`, shipment_ids);
    db.run(`DELETE FROM shipments WHERE id IN (${placeholders})`, shipment_ids, function (err) {
      if (err) {
        db.run('ROLLBACK');
        console.error('Erro ao excluir lançamentos em lote:', err);
        return res.status(500).json({ error: 'Erro ao excluir lançamentos do banco de dados.' });
      }

      const deletedCount = this.changes;
      db.run('COMMIT', (commitErr) => {
        if (commitErr) {
          return res.status(500).json({ error: 'Erro ao confirmar exclusão em lote.' });
        }
        res.json({
          message: `${deletedCount} lançamento(s) excluído(s) com sucesso.`,
          deletedCount
        });
      });
    });
  });
});

// 8. Receber / Cobrar Pedidos (Individual ou Lote) com Upload de NF e Boleto (Admin)
router.post(
  '/receive',
  uploadFiscal.fields([
    { name: 'nf_file', maxCount: 1 },
    { name: 'boleto_file', maxCount: 1 }
  ]),
  (req, res) => {
    if (req.isClient) {
      return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
    }

    let items = [];
    try {
      items = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : (req.body.items || []);
    } catch (e) {
      items = [];
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos um pedido para receber ou faturar.' });
    }

    const nfNumber = (req.body.nf_number || '').trim();
    const validPaymentStatuses = ['em_aberto', 'aguardando_pagamento', 'pago'];
    const paymentStatus = validPaymentStatuses.includes(req.body.payment_status)
      ? req.body.payment_status
      : 'aguardando_pagamento';

    const nfFileObj = req.files && req.files['nf_file'] && req.files['nf_file'][0] ? req.files['nf_file'][0] : null;
    const boletoFileObj = req.files && req.files['boleto_file'] && req.files['boleto_file'][0] ? req.files['boleto_file'][0] : null;

    const uploadedNfUrl = nfFileObj ? `/uploads/fiscal/${nfFileObj.filename}` : (req.body.existing_nf_url || null);
    const uploadedBoletoUrl = boletoFileObj ? `/uploads/fiscal/${boletoFileObj.filename}` : (req.body.existing_boleto_url || null);

    const flowIds = items.filter(i => i.origin !== 'store').map(i => parseInt(i.id, 10)).filter(Boolean);
    const storeIds = items.filter(i => i.origin === 'store').map(i => parseInt(i.id, 10)).filter(Boolean);

    const buildUpdateQuery = (tableName, ids) => {
      const sets = ['billed_at = CURRENT_TIMESTAMP'];
      const params = [];

      if (paymentStatus) {
        sets.push('payment_status = ?');
        params.push(paymentStatus);
      }
      if (nfNumber !== '') {
        sets.push('nf_number = ?');
        params.push(nfNumber);
      }
      if (uploadedNfUrl) {
        sets.push('nf_url = ?');
        params.push(uploadedNfUrl);
      }
      if (uploadedBoletoUrl) {
        sets.push('boleto_url = ?');
        params.push(uploadedBoletoUrl);
      }

      const placeholders = ids.map(() => '?').join(',');
      const sql = `UPDATE ${tableName} SET ${sets.join(', ')} WHERE id IN (${placeholders})`;
      return { sql, params: [...params, ...ids] };
    };

    const promises = [];

    if (flowIds.length > 0) {
      const { sql, params } = buildUpdateQuery('shipments', flowIds);
      promises.push(new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      }));
    }

    if (storeIds.length > 0) {
      const { sql, params } = buildUpdateQuery('store_orders', storeIds);
      promises.push(new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      }));
    }

    Promise.all(promises)
      .then(() => {
        res.json({
          success: true,
          message: paymentStatus === 'pago'
            ? `Pagamento aprovado e documentos salvos em ${items.length} pedido(s)!`
            : `Cobrança gerada (Aguard. Pagamento) e documentos salvos em ${items.length} pedido(s)!`,
          payment_status: paymentStatus,
          nf_url: uploadedNfUrl,
          boleto_url: uploadedBoletoUrl,
          nf_number: nfNumber
        });
      })
      .catch(err => {
        console.error('Erro ao processar cobrança/recebimento:', err);
        res.status(500).json({ error: 'Erro ao salvar dados de cobrança: ' + err.message });
      });
  }
);

// 9. Resumo de Notificações e Alertas (Sinos do Menu Lateral + Sino do Topo Direito)
router.get('/notifications-summary', (req, res) => {
  const clientId = req.clientId ? Number(req.clientId) : null;
  const isMotherClient = Boolean(req.isClient && !req.parentClientId);

  // Filtros de visibilidade do cliente
  let shipClientWhere = '1=1';
  let shipClientParams = [];
  let storeClientWhere = '1=1';
  let storeClientParams = [];

  if (clientId) {
    if (!req.parentClientId) {
      shipClientWhere = '(client_id = ? OR parent_client_id = ? OR billing_client_id = ?)';
      shipClientParams = [clientId, clientId, clientId];
      storeClientWhere = '(client_id = ? OR parent_client_id = ? OR billing_client_id = ?)';
      storeClientParams = [clientId, clientId, clientId];
    } else {
      shipClientWhere = '(client_id = ? OR billing_client_id = ?)';
      shipClientParams = [clientId, clientId];
      storeClientWhere = '(client_id = ? OR billing_client_id = ?)';
      storeClientParams = [clientId, clientId];
    }
  }

  const runCount = (sql, params = []) => new Promise((resolve) => {
    db.get(sql, params, (err, row) => {
      if (err || !row) return resolve(0);
      resolve(Number(row.cnt) || 0);
    });
  });

  const runAll = (sql, params = []) => new Promise((resolve) => {
    db.all(sql, params, (err, rows) => {
      if (err || !rows) return resolve([]);
      resolve(rows);
    });
  });

  Promise.all([
    // Admin counts
    runCount(`SELECT COUNT(*) as cnt FROM store_orders WHERE status = 'em_aberto'`),
    runCount(`SELECT COUNT(*) as cnt FROM shipments WHERE status = 'em_aberto'`),
    runCount(`SELECT COUNT(*) as cnt FROM shipments WHERE status NOT IN ('draft', 'em_aberto') AND payment_status = 'aguardando_pagamento'`),
    runCount(`SELECT COUNT(*) as cnt FROM store_orders WHERE status NOT IN ('aguardando_aprovacao_mae', 'recusado_matriz', 'em_aberto', 'cancelado') AND payment_status = 'aguardando_pagamento'`),

    // Client / Mother counts & document keys
    clientId
      ? runCount(`SELECT COUNT(*) as cnt FROM store_orders WHERE (client_id = ? OR parent_client_id = ?) AND status = 'aguardando_aprovacao_mae'`, [clientId, clientId])
      : Promise.resolve(0),
    clientId
      ? runAll(`SELECT id, boleto_url, nf_url, billed_at FROM shipments WHERE status NOT IN ('draft', 'em_aberto') AND ${shipClientWhere} AND COALESCE(payment_status, 'em_aberto') != 'pago' AND ((boleto_url IS NOT NULL AND boleto_url != '') OR (nf_url IS NOT NULL AND nf_url != ''))`, shipClientParams)
      : Promise.resolve([]),
    clientId
      ? runAll(`SELECT id, boleto_url, nf_url, billed_at FROM store_orders WHERE status NOT IN ('aguardando_aprovacao_mae', 'recusado_matriz', 'em_aberto', 'cancelado') AND ${storeClientWhere} AND COALESCE(payment_status, 'em_aberto') != 'pago' AND ((boleto_url IS NOT NULL AND boleto_url != '') OR (nf_url IS NOT NULL AND nf_url != ''))`, storeClientParams)
      : Promise.resolve([])
  ]).then(([
    adminOpenStoreOrders,
    adminOpenShipments,
    adminAwaitingPayShip,
    adminAwaitingPayStore,
    motherPendingApprovals,
    clientShipDocs,
    clientStoreDocs
  ]) => {
    const billingDocKeys = [];
    const nfDocKeys = [];

    (clientShipDocs || []).forEach(r => {
      if (r.boleto_url || r.nf_url) {
        billingDocKeys.push(`ship:${r.id}:${r.boleto_url || ''}:${r.nf_url || ''}`);
      }
      if (r.nf_url) {
        nfDocKeys.push(`ship:${r.id}:${r.nf_url}`);
      }
    });

    (clientStoreDocs || []).forEach(r => {
      if (r.boleto_url || r.nf_url) {
        billingDocKeys.push(`store:${r.id}:${r.boleto_url || ''}:${r.nf_url || ''}`);
      }
      if (r.nf_url) {
        nfDocKeys.push(`store:${r.id}:${r.nf_url}`);
      }
    });

    res.json({
      admin: {
        open_store_orders: adminOpenStoreOrders,
        open_shipments: adminOpenShipments,
        awaiting_payment: adminAwaitingPayShip + adminAwaitingPayStore
      },
      client: {
        is_mother: isMotherClient,
        mother_pending_approvals: motherPendingApprovals,
        billing_doc_keys: billingDocKeys,
        nf_doc_keys: nfDocKeys
      }
    });
  }).catch(err => {
    console.error('Erro em notifications-summary:', err);
    res.status(500).json({ error: 'Erro ao consultar notificações.' });
  });
});

module.exports = router;
