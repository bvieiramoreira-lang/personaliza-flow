const express = require('express');
const router = express.Router();
const db = require('../database');

// 1. Listar todos os endereços salvos (suporta filtro por client_id e isolamento multi-tenant)
router.get('/', (req, res) => {
  let query = 'SELECT * FROM addresses';
  const params = [];

  if (req.isClient) {
    query += ' WHERE client_id = ?';
    params.push(req.clientId);
  } else if (req.clientId) {
    query += ' WHERE client_id = ?';
    params.push(req.clientId);
  }

  query += ' ORDER BY id DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ addresses: rows || [] });
  });
});

// 2. Obter endereço único por ID
router.get('/:id', (req, res) => {
  let query = 'SELECT * FROM addresses WHERE id = ?';
  const params = [req.params.id];

  if (req.isClient) {
    query += ' AND client_id = ?';
    params.push(req.clientId);
  }

  db.get(query, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Endereço não encontrado.' });
    res.json({ address: row });
  });
});

// 3. Cadastrar novo endereço
router.post('/', (req, res) => {
  const {
    title,
    recipient_name,
    cep,
    address,
    number,
    complement,
    neighborhood,
    city,
    state,
    client_id
  } = req.body;

  if (!cep) {
    return res.status(400).json({ error: 'O CEP é obrigatório.' });
  }

  const targetClientId = req.isClient ? req.clientId : (client_id || req.clientId || null);
  const defaultTitle = title && title.trim() !== '' ? title.trim() : (recipient_name || `Endereço CEP ${cep}`);

  const query = `
    INSERT INTO addresses (
      client_id, title, recipient_name, cep, address, number, complement, neighborhood, city, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    query,
    [
      targetClientId,
      defaultTitle,
      recipient_name || '',
      cep,
      address || '',
      number || '',
      complement || '',
      neighborhood || '',
      city || '',
      state || ''
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({
        message: 'Endereço cadastrado com sucesso!',
        id: this.lastID
      });
    }
  );
});

// 4. Atualizar endereço existente
router.put('/:id', (req, res) => {
  const {
    title,
    recipient_name,
    cep,
    address,
    number,
    complement,
    neighborhood,
    city,
    state
  } = req.body;

  let query = `
    UPDATE addresses SET
      title = ?, recipient_name = ?, cep = ?, address = ?, number = ?,
      complement = ?, neighborhood = ?, city = ?, state = ?
    WHERE id = ?
  `;
  const params = [
    title || '',
    recipient_name || '',
    cep || '',
    address || '',
    number || '',
    complement || '',
    neighborhood || '',
    city || '',
    state || '',
    req.params.id
  ];

  if (req.isClient) {
    query += ' AND client_id = ?';
    params.push(req.clientId);
  }

  db.run(query, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Endereço não encontrado ou sem permissão.' });
    }
    res.json({ message: 'Endereço atualizado com sucesso!' });
  });
});

// 5. Excluir endereço
router.delete('/:id', (req, res) => {
  let query = 'DELETE FROM addresses WHERE id = ?';
  const params = [req.params.id];

  if (req.isClient) {
    query += ' AND client_id = ?';
    params.push(req.clientId);
  }

  db.run(query, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Endereço não encontrado ou sem permissão.' });
    }
    res.json({ message: 'Endereço excluído com sucesso!' });
  });
});

module.exports = router;
