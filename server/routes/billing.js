const express = require('express');
const router = express.Router();
const db = require('../database');

// 1. Resumo Financeiro (Total em Aberto, Total Pago, Contadores)
router.get('/summary', (req, res) => {
  let query = `
    SELECT 
      COALESCE(SUM(CASE WHEN payment_status = 'pago' THEN final_freight_price ELSE 0 END), 0) as total_pago,
      COALESCE(SUM(CASE WHEN payment_status IS NULL OR payment_status != 'pago' THEN final_freight_price ELSE 0 END), 0) as total_em_aberto,
      COUNT(CASE WHEN payment_status IS NULL OR payment_status != 'pago' THEN 1 END) as count_em_aberto,
      COUNT(CASE WHEN payment_status = 'pago' THEN 1 END) as count_pago
    FROM shipments
    WHERE status != 'draft'
  `;
  const params = [];

  if (req.isClient) {
    query += ` AND client_id = ?`;
    params.push(req.clientId);
  } else if (req.clientId) {
    query += ` AND client_id = ?`;
    params.push(req.clientId);
  }

  db.get(query, params, (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(row || {});
  });
});

// 2. Listar Todos os Envios com Status de Pagamento
router.get('/shipments', (req, res) => {
  let query = `
    SELECT 
      s.id,
      s.code,
      s.client_id,
      c.name as client_name,
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
      s.created_at
    FROM shipments s
    LEFT JOIN clients c ON s.client_id = c.id
    WHERE s.status != 'draft'
  `;
  const params = [];

  if (req.isClient) {
    query += ` AND s.client_id = ?`;
    params.push(req.clientId);
  } else if (req.clientId) {
    query += ` AND s.client_id = ?`;
    params.push(req.clientId);
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

  if (!['em_aberto', 'pago'].includes(payment_status)) {
    return res.status(400).json({ error: 'Status de pagamento inválido.' });
  }

  const placeholders = shipment_ids.map(() => '?').join(',');
  const query = `UPDATE shipments SET payment_status = ? WHERE id IN (${placeholders})`;

  db.run(query, [payment_status, ...shipment_ids], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json({
      message: `Status atualizado para "${payment_status === 'pago' ? 'Pago' : 'Em Aberto'}" em ${this.changes} pedido(s).`,
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

module.exports = router;
