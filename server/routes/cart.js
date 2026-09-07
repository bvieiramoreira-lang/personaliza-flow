const express = require('express');
const router = express.Router();
const db = require('../database');
const { calculatePackages } = require('../services/packagingEngine');

function getCartSessionId(req) {
  if (req.clientId) {
    return `cart_client_${req.clientId}`;
  }
  if (req.user && req.user.id) {
    return `cart_client_${req.user.id}`;
  }
  return 'default_session';
}

// Obter os itens do Carrinho de Envio com os dados completos do produto e regra de embalagem
router.get('/', (req, res) => {
  const sessionId = getCartSessionId(req);
  const query = `
    SELECT 
      c.id as cart_item_id,
      c.quantity,
      p.id as product_id,
      p.code,
      p.name,
      p.description,
      p.image_url,
      p.unit_weight,
      p.unit_height,
      p.unit_width,
      p.unit_length,
      p.unit_measure,
      pr.max_qty_per_box,
      pr.box_weight,
      pr.box_height,
      pr.box_width,
      pr.box_length
    FROM cart_items c
    JOIN products p ON c.product_id = p.id
    LEFT JOIN packaging_rules pr ON p.id = pr.product_id
    WHERE c.session_id = ?
    ORDER BY c.created_at ASC
  `;

  db.all(query, [sessionId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// Obter resumo de embalagens do carrinho atual
router.get('/packages', (req, res) => {
  const sessionId = getCartSessionId(req);
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
      return res.json({ packages: [], total_weight: 0, total_volumes: 0, items_breakdown: [] });
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

// Adicionar produto ao Carrinho de Envio (suporta '/' e '/items')
const addCartItemHandler = (req, res) => {
  const sessionId = getCartSessionId(req);
  const effectiveClientId = req.isClient ? req.clientId : (req.clientId || null);
  const { product_id, quantity } = req.body;
  const qty = parseInt(quantity, 10) || 1;

  if (!product_id) {
    return res.status(400).json({ error: 'product_id é obrigatório.' });
  }

  db.run(
    'INSERT INTO cart_items (session_id, client_id, product_id, quantity) VALUES (?, ?, ?, ?)',
    [sessionId, effectiveClientId, product_id, qty],
    function (insertErr) {
      if (insertErr) return res.status(500).json({ error: insertErr.message });
      res.status(201).json({ message: 'Item adicionado ao carrinho!', cart_item_id: this.lastID, quantity: qty });
    }
  );
};

router.post('/', addCartItemHandler);
router.post('/items', addCartItemHandler);

// Atualizar quantidade de um item do carrinho
const updateCartItemHandler = (req, res) => {
  const sessionId = getCartSessionId(req);
  const cartItemId = req.params.id;
  const { quantity } = req.body;
  const qty = parseInt(quantity, 10);

  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantidade inválida.' });
  }

  db.run(
    'UPDATE cart_items SET quantity = ? WHERE id = ? AND session_id = ?',
    [qty, cartItemId, sessionId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Quantidade atualizada com sucesso!' });
    }
  );
};

router.put('/:id', updateCartItemHandler);
router.put('/items/:id', updateCartItemHandler);

// Remover item do carrinho
const removeCartItemHandler = (req, res) => {
  const sessionId = getCartSessionId(req);
  const cartItemId = req.params.id;

  db.run(
    'DELETE FROM cart_items WHERE id = ? AND session_id = ?',
    [cartItemId, sessionId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Item removido do carrinho!' });
    }
  );
};

router.delete('/:id', removeCartItemHandler);
router.delete('/items/:id', removeCartItemHandler);

// Limpar todo o carrinho
router.delete('/', (req, res) => {
  const sessionId = getCartSessionId(req);
  db.run('DELETE FROM cart_items WHERE session_id = ?', [sessionId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Carrinho limpo com sucesso!' });
  });
});

module.exports = router;
