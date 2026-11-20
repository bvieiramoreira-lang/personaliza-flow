const express = require('express');
const router = express.Router();
const db = require('../database');
const { quoteFreight } = require('../services/freightService');

function maskSecretToken(token) {
  if (!token || token.length < 20) return '';
  return `${token.slice(0, 12)}...${token.slice(-10)}`;
}

// Obter configurações (Token do Melhor Envio nunca é enviado inteiro na rede)
router.get('/', (req, res) => {
  db.all('SELECT * FROM settings', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro ao carregar configurações.' });
    const settingsMap = {};
    rows.forEach(r => { settingsMap[r.key] = r.value; });

    const effectiveToken = (settingsMap.melhor_envio_token || process.env.MELHOR_ENVIO_TOKEN || '').trim();
    const hasToken = Boolean(effectiveToken && effectiveToken !== 'your_melhor_envio_token_here');

    res.json({
      origin_cep: settingsMap.origin_cep || process.env.ORIGIN_CEP || '88133700',
      default_markup_percent: settingsMap.default_markup_percent || process.env.DEFAULT_MARKUP_PERCENT || '10.0',
      freight_provider: 'melhor_envio',
      melhor_envio_env: settingsMap.melhor_envio_env || process.env.MELHOR_ENVIO_ENV || 'production',
      melhor_envio_token_masked: req.isAdmin && hasToken ? maskSecretToken(effectiveToken) : '',
      has_melhor_envio_token: hasToken
    });
  });
});

// Atualizar configurações globais e credenciais Melhor Envio (Somente Admin)
router.put('/', (req, res) => {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }

  const { origin_cep, default_markup_percent, melhor_envio_token, melhor_envio_env } = req.body || {};

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  if (origin_cep !== undefined) stmt.run('origin_cep', String(origin_cep).replace(/\D/g, ''));
  if (default_markup_percent !== undefined) stmt.run('default_markup_percent', String(default_markup_percent));
  if (melhor_envio_env !== undefined) stmt.run('melhor_envio_env', String(melhor_envio_env).trim());

  // Só substitui o token se o Admin digitou um novo token completo (não vazio e não mascarado)
  if (melhor_envio_token !== undefined) {
    const cleanTok = String(melhor_envio_token).trim();
    if (cleanTok !== '' && !cleanTok.includes('...')) {
      stmt.run('melhor_envio_token', cleanTok);
    }
  }
  stmt.run('freight_provider', 'melhor_envio');

  stmt.finalize((err) => {
    if (err) return res.status(500).json({ error: 'Erro ao salvar configurações.' });
    res.json({ message: 'Configurações do Melhor Envio e margem atualizadas com sucesso!' });
  });
});

// Testar cotação em tempo real no Melhor Envio (Somente Admin)
router.post('/melhor-envio/test', async (req, res) => {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }

  const { cep, weight, height, width, length } = req.body || {};
  const cleanCep = String(cep || '').replace(/\D/g, '');

  if (!cleanCep || cleanCep.length !== 8) {
    return res.status(400).json({ error: 'Informe um CEP de destino válido com 8 dígitos para testar.' });
  }

  try {
    const testPackage = {
      weight: Math.max(0.1, parseFloat(weight) || 0.5),
      height: Math.max(2, parseFloat(height) || 15),
      width: Math.max(11, parseFloat(width) || 15),
      length: Math.max(16, parseFloat(length) || 20)
    };

    const quotes = await quoteFreight({
      destCep: cleanCep,
      packages: [testPackage]
    });

    res.json({
      success: true,
      dest_cep: cleanCep,
      package_tested: testPackage,
      quotes: quotes || []
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao testar cotação no Melhor Envio.' });
  }
});

module.exports = router;
