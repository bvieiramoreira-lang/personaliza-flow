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
const { seedDatabase } = require('./seed');
const tenantMiddleware = require('./middleware/tenant');

const app = express();
const PORT = process.env.PORT || 3005;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos do Frontend e Uploads
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Middleware Multi-Tenant para isolamento de dados por cliente
app.use(tenantMiddleware);

// Rotas da API
app.use('/api/auth', authRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/products', productsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/shipments', shipmentsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/addresses', addressesRouter);
app.use('/api/billing', billingRouter);

// Inicializar banco com dados de exemplo se estiver vazio
seedDatabase();

// Rota padrão SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 PERSONALIZA FLOW rodando em http://localhost:${PORT}`);
  console.log(`==================================================`);
});
