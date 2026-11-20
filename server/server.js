require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRouter = require('./routes/auth');
const clientsRouter = require('./routes/clients');
const productsRouter = require('./routes/products');
const cartRouter = require('./routes/cart');
const shipmentsRouter = require('./routes/shipments');
const settingsRouter = require('./routes/settings');
const addressesRouter = require('./routes/addresses');
const billingRouter = require('./routes/billing');
const storeRouter = require('./routes/store');
const integrationsRouter = require('./routes/integrations');
const { seedDatabase } = require('./seed');
const tenantMiddleware = require('./middleware/tenant');

const app = express();
const PORT = process.env.PORT || 3005;

// 1. Ocultar assinatura do servidor (Item 11 - Debug/Fingerprint desligado)
app.disable('x-powered-by');

// 2. Headers de Segurança HTTP e Bloqueio de Arquivos Ocultos (Itens 2 e 19)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Bloquear tentativa de acesso a arquivos ocultos (/.env, /.git, etc.)
  const reqPath = req.path || '';
  if (reqPath.includes('/.')) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  next();
});

// 3. CORS e Limite de Payload JSON (Itens 13 e 19)
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 4. Rate Limiter Global para rotas de API (Item 17 - Limite de tentativas)
const apiRateMap = new Map();
const API_WINDOW_MS = 60 * 1000; // 1 minuto
const API_MAX_REQUESTS = 240; // máx 240 req/min por IP

app.use('/api', (req, res, next) => {
  const xff = req.headers['x-forwarded-for'];
  const ip = xff ? String(xff).split(',')[0].trim() : (req.ip || req.socket?.remoteAddress || 'unknown');
  const now = Date.now();
  const entry = apiRateMap.get(ip);

  if (!entry || now - entry.windowStart > API_WINDOW_MS) {
    apiRateMap.set(ip, { count: 1, windowStart: now });
    return next();
  }

  entry.count += 1;
  if (entry.count > API_MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Limite de requisições excedido. Aguarde alguns segundos e tente novamente.'
    });
  }
  next();
});

// 5. Servir arquivos estáticos do Frontend e Uploads (sem listagem de diretórios e sem dotfiles)
app.use(express.static(path.join(__dirname, '../public'), { dotfiles: 'deny', index: 'index.html' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), { dotfiles: 'deny', index: false }));

// 6. Middleware Multi-Tenant e Autenticação no Servidor (Itens 4, 5, 6, 7 e 10)
app.use(tenantMiddleware);

// 7. Rotas da API
app.use('/api/auth', authRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/products', productsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/shipments', shipmentsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/addresses', addressesRouter);
app.use('/api/billing', billingRouter);
app.use('/api/store', storeRouter);
app.use('/api/integrations', integrationsRouter);

// Inicializar banco com dados de exemplo se estiver vazio
seedDatabase();

// Rota padrão SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Rota de API não encontrada.' });
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 8. Tratador Global de Erros sem vazar stack trace ou detalhes internos de SQL (Itens 12 e 15)
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'O arquivo enviado excede o tamanho máximo permitido.' });
  }
  if (err.message && (err.message.includes('Formato de arquivo') || err.message.includes('não permitido'))) {
    return res.status(400).json({ error: err.message });
  }
  console.error('Erro interno capturado:', err.message);
  res.status(500).json({ error: 'Ocorreu um erro interno ao processar a solicitação.' });
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 PERSONALIZA FLOW rodando em http://localhost:${PORT}`);
  console.log(`==================================================`);
});
