const express = require('express');
const router = express.Router();
const db = require('../database');
const disktenhaService = require('../services/disktenhaService');

// Obter todas as configurações
router.get('/', (req, res) => {
  db.all('SELECT * FROM settings', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settingsMap = {};
    rows.forEach(r => { settingsMap[r.key] = r.value; });
    res.json(settingsMap);
  });
});

// Atualizar configurações globais
router.put('/', (req, res) => {
  const { origin_cep, default_markup_percent, freight_provider } = req.body;

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  if (origin_cep !== undefined) stmt.run('origin_cep', origin_cep);
  if (default_markup_percent !== undefined) stmt.run('default_markup_percent', default_markup_percent.toString());
  if (freight_provider !== undefined) stmt.run('freight_provider', freight_provider);

  stmt.finalize((err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Configurações atualizadas com sucesso!' });
  });
});

// -----------------------------------------------------------------------------
// ENDPOINTS DA TRANSPORTADORA DISKTENHA
// -----------------------------------------------------------------------------

// Resumo do status da tabela Disktenha
router.get('/disktenha/summary', (req, res) => {
  try {
    const summary = disktenhaService.getSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listagem de todas as cidades atendidas pela Disktenha
router.get('/disktenha/cities', (req, res) => {
  try {
    const cities = disktenhaService.getAllCities();
    res.json(cities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teste rápido de CEP na tabela Disktenha
router.post('/disktenha/test', (req, res) => {
  const { cep } = req.body;
  if (!cep) {
    return res.status(400).json({ error: 'Informe um CEP para testar.' });
  }

  try {
    const quote = disktenhaService.getQuoteForCep(cep);
    if (!quote) {
      return res.json({
        covered: false,
        message: 'Este CEP não é atendido pela transportadora Disktenha.'
      });
    }

    res.json({
      covered: true,
      quote
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recarregar tabela a partir da planilha
router.post('/disktenha/reload', (req, res) => {
  try {
    const summary = disktenhaService.reload();
    res.json({ message: 'Tabela recarregada com sucesso!', summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

