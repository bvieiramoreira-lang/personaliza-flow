const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { hashPassword } = require('../seed');

// GET /api/clients - Listar todos os clientes cadastrados com estatísticas
router.get('/', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }

  const query = `
    SELECT 
      c.id, c.name, c.email, c.cnpj_cpf, c.phone, c.role, c.status, c.created_at,
      (SELECT COUNT(*) FROM products p WHERE p.client_id = c.id) as total_products,
      (SELECT COUNT(*) FROM shipments s WHERE s.client_id = c.id) as total_shipments,
      (SELECT COALESCE(SUM(s.final_freight_price), 0) FROM shipments s WHERE s.client_id = c.id AND s.payment_status = 'em_aberto') as open_balance,
      (SELECT COALESCE(SUM(s.final_freight_price), 0) FROM shipments s WHERE s.client_id = c.id AND s.payment_status = 'pago') as paid_balance
    FROM clients c
    WHERE c.role = 'client'
    ORDER BY c.created_at DESC
  `;

  db.all(query, [], (err, clients) => {
    if (err) {
      console.error('Erro ao listar clientes:', err);
      return res.status(500).json({ error: 'Erro ao buscar clientes no banco de dados.' });
    }
    res.json(clients);
  });
});

// GET /api/clients/:id - Detalhes completos de um cliente específico (Produtos, Carteira, Dados)
router.get('/:id', (req, res) => {
  const clientId = req.params.id;

  if (req.isClient && parseInt(clientId, 10) !== req.clientId) {
    return res.status(403).json({ error: 'Acesso negado aos dados deste cliente.' });
  }

  db.get(
    `SELECT id, name, email, cnpj_cpf, phone, role, status, created_at FROM clients WHERE id = ?`,
    [clientId],
    (err, client) => {
      if (err || !client) {
        return res.status(404).json({ error: 'Cliente não encontrado.' });
      }

      // Buscar produtos do cliente
      db.all(
        `SELECT id, code, name, description, image_url, stock_qty, unit_weight, unit_measure FROM products WHERE client_id = ? ORDER BY id DESC`,
        [clientId],
        (pErr, products) => {
          // Buscar remessas/carteira do cliente
          db.all(
            `SELECT id, code, type, recipient_name, dest_city, dest_state, final_freight_price, status, payment_status, created_at FROM shipments WHERE client_id = ? ORDER BY id DESC`,
            [clientId],
            (sErr, shipments) => {
              // Buscar endereços do cliente
              db.all(
                `SELECT * FROM addresses WHERE client_id = ? ORDER BY is_default DESC`,
                [clientId],
                (aErr, addresses) => {
                  const openBalance = (shipments || [])
                    .filter(s => s.payment_status === 'em_aberto')
                    .reduce((acc, s) => acc + (s.final_freight_price || 0), 0);

                  const paidBalance = (shipments || [])
                    .filter(s => s.payment_status === 'pago')
                    .reduce((acc, s) => acc + (s.final_freight_price || 0), 0);

                  res.json({
                    client,
                    stats: {
                      total_products: (products || []).length,
                      total_shipments: (shipments || []).length,
                      open_balance: openBalance,
                      paid_balance: paidBalance
                    },
                    products: products || [],
                    shipments: shipments || [],
                    addresses: addresses || []
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

// POST /api/clients - Criar novo cliente
router.post('/', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }

  const { name, email, password, cnpj_cpf, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios para cadastrar um cliente.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const passwordHash = hashPassword(password);

  db.run(
    `INSERT INTO clients (name, email, password_hash, cnpj_cpf, phone, role, status) VALUES (?, ?, ?, ?, ?, 'client', 'active')`,
    [name.trim(), cleanEmail, passwordHash, cnpj_cpf || null, phone || null],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Já existe um cliente cadastrado com este e-mail.' });
        }
        console.error('Erro ao cadastrar cliente:', err);
        return res.status(500).json({ error: 'Erro ao salvar novo cliente no banco de dados.' });
      }

      res.status(201).json({
        success: true,
        client: {
          id: this.lastID,
          name: name.trim(),
          email: cleanEmail,
          cnpj_cpf,
          phone,
          role: 'client',
          status: 'active'
        }
      });
    }
  );
});

// PUT /api/clients/:id - Atualizar cliente
router.put('/:id', (req, res) => {
  const clientId = parseInt(req.params.id, 10);

  if (req.isClient && clientId !== req.clientId) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  const { name, email, password, cnpj_cpf, cnpj, doc, phone, status } = req.body;
  const finalDoc = cnpj_cpf !== undefined ? cnpj_cpf : (cnpj !== undefined ? cnpj : (doc !== undefined ? doc : null));
  const finalPhone = phone ? phone.trim() : null;
  const finalName = name ? name.trim() : '';
  const finalEmail = email ? email.trim().toLowerCase() : '';

  if (password && password.trim().length > 0) {
    const cleanPass = password.trim();
    if (cleanPass.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve possuir no mínimo 6 caracteres.' });
    }
    const passwordHash = hashPassword(cleanPass);
    db.run(
      `UPDATE clients SET name = ?, email = ?, password_hash = ?, cnpj_cpf = ?, phone = ?, status = ? WHERE id = ?`,
      [finalName, finalEmail, passwordHash, finalDoc, finalPhone, status || 'active', clientId],
      function (err) {
        if (err) {
          console.error('Erro ao atualizar cliente com senha:', err);
          return res.status(500).json({ error: 'Erro ao atualizar dados do cliente.' });
        }
        res.json({ success: true, message: 'Dados e senha do cliente atualizados com sucesso.' });
      }
    );
  } else {
    db.run(
      `UPDATE clients SET name = ?, email = ?, cnpj_cpf = ?, phone = ?, status = ? WHERE id = ?`,
      [finalName, finalEmail, finalDoc, finalPhone, status || 'active', clientId],
      function (err) {
        if (err) {
          console.error('Erro ao atualizar cliente:', err);
          return res.status(500).json({ error: 'Erro ao atualizar dados do cliente.' });
        }
        res.json({ success: true, message: 'Dados do cliente atualizados com sucesso.' });
      }
    );
  }
});

// DELETE /api/clients/:id - Excluir cliente e seus dados (com exclusão em cascata de produtos, remessas e regras)
router.delete('/:id', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }

  const clientId = parseInt(req.params.id, 10);
  if (isNaN(clientId)) {
    return res.status(400).json({ error: 'ID de cliente inválido.' });
  }

  // Verificar se o cliente existe e se não é um administrador
  db.get('SELECT id, name, role FROM clients WHERE id = ?', [clientId], (getErr, client) => {
    if (getErr) {
      console.error('Erro ao consultar cliente para exclusão:', getErr);
      return res.status(500).json({ error: 'Erro ao consultar cliente no banco de dados.' });
    }
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    if (client.role === 'admin') {
      return res.status(400).json({ error: 'Não é permitido excluir uma conta de administrador.' });
    }

    // Buscar imagens de produtos vinculados a este cliente para remover do disco
    db.all('SELECT image_url FROM products WHERE client_id = ?', [clientId], (imgErr, prods) => {
      const imagesToDelete = (prods || [])
        .map(p => p.image_url)
        .filter(url => url && url.startsWith('/uploads/'));

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // 1. Remover itens do carrinho vinculados ao cliente ou aos produtos dele
        db.run(
          'DELETE FROM cart_items WHERE client_id = ? OR product_id IN (SELECT id FROM products WHERE client_id = ?)',
          [clientId, clientId]
        );

        // 2. Remover pacotes/volumes de remessas do cliente
        db.run(
          'DELETE FROM shipment_packages WHERE shipment_id IN (SELECT id FROM shipments WHERE client_id = ?)',
          [clientId]
        );

        // 3. Remover itens de remessas do cliente ou que apontem para produtos deste cliente
        db.run(
          'DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE client_id = ?) OR product_id IN (SELECT id FROM products WHERE client_id = ?)',
          [clientId, clientId]
        );

        // 4. Remover remessas do cliente
        db.run(
          'DELETE FROM shipments WHERE client_id = ?',
          [clientId]
        );

        // 5. Remover faturas / fechamentos do cliente
        db.run(
          'DELETE FROM billing_invoices WHERE client_id = ?',
          [clientId]
        );

        // 6. Remover endereços cadastrados do cliente
        db.run(
          'DELETE FROM addresses WHERE client_id = ?',
          [clientId]
        );

        // 7. Remover regras de embalagem dos produtos do cliente
        db.run(
          'DELETE FROM packaging_rules WHERE product_id IN (SELECT id FROM products WHERE client_id = ?)',
          [clientId]
        );

        // 8. Remover todos os produtos vinculados a este cliente
        db.run(
          'DELETE FROM products WHERE client_id = ?',
          [clientId]
        );

        // 9. Remover o próprio cadastro do cliente
        db.run(
          'DELETE FROM clients WHERE id = ? AND role != "admin"',
          [clientId],
          function (delErr) {
            if (delErr) {
              db.run('ROLLBACK');
              console.error('Erro ao excluir cliente:', delErr);
              return res.status(500).json({ error: 'Erro ao excluir cliente do banco de dados.' });
            }

            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                console.error('Erro ao efetivar exclusão:', commitErr);
                return res.status(500).json({ error: 'Erro ao efetivar transação de exclusão.' });
              }

              // Limpar fotos locais de produtos excluídos
              imagesToDelete.forEach(imgUrl => {
                try {
                  const filename = path.basename(imgUrl);
                  const fullPath = path.join(__dirname, '../../uploads', filename);
                  if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                  }
                } catch (e) {
                  console.warn('Não foi possível remover imagem do produto:', imgUrl, e.message);
                }
              });

              res.json({
                success: true,
                message: `Cliente "${client.name}" e todos os seus produtos e dados vinculados foram excluídos com sucesso.`
              });
            });
          }
        );
      });
    });
  });
});

module.exports = router;
