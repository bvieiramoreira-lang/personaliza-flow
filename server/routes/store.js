const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database');
const { calculatePackages } = require('../services/packagingEngine');
const { quoteFreight } = require('../services/freightService');

// Configuração do Multer para Upload de Fotos da Loja
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.png';
    cb(null, 'store-prod-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage });

// Upload de fotos (suporta única ou múltiplas fotos)
router.post('/upload', upload.array('images', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo de imagem enviado.' });
  }
  const urls = req.files.map(f => `/uploads/${f.filename}`);
  res.json({ urls, imageUrl: urls[0] });
});

function getEffectiveClientId(req, bodyClientId) {
  if (req.isClient && req.clientId) return req.clientId;
  if (bodyClientId) return parseInt(bodyClientId, 10);
  if (req.query && req.query.client_id) return parseInt(req.query.client_id, 10);
  if (req.headers['x-target-client-id']) return parseInt(req.headers['x-target-client-id'], 10);
  if (req.clientId) return req.clientId;
  if (req.user && req.user.id) return req.user.id;
  return 1;
}

// =========================================================================
// 1. CONFIGURAÇÃO DA LOJA DO CLIENTE (ATIVAR / PERSONALIZAR)
// =========================================================================

function parsePaymentMethods(rawJson) {
  if (!rawJson) return ['30 DIAS BOLETO'];
  try {
    const arr = JSON.parse(rawJson);
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch (e) {}
  return ['30 DIAS BOLETO'];
}

// Obter configuração da loja de um cliente específico (herda da Conta Mãe se for Sede Filha)
router.get('/client-config/:clientId', (req, res) => {
  const clientId = parseInt(req.params.clientId, 10);
  if (!clientId) return res.status(400).json({ error: 'ID do cliente inválido.' });

  db.get(
    `SELECT c.id, c.name as client_name, c.email as client_email, c.parent_client_id, c.can_access_store,
            sc.id as sc_id, sc.is_enabled, sc.store_title, sc.welcome_message, sc.payment_methods_json
     FROM clients c
     LEFT JOIN store_settings_client sc ON sc.client_id = COALESCE(c.parent_client_id, c.id)
     WHERE c.id = ?`,
    [clientId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Cliente não encontrado.' });

      const storeAllowedByBranch = row.can_access_store !== undefined && row.can_access_store !== null ? Number(row.can_access_store) : 1;
      const effectiveEnabled = storeAllowedByBranch === 0 ? 0 : (row.is_enabled !== null && row.is_enabled !== undefined ? row.is_enabled : 0);

      res.json({
        client_id: clientId,
        root_client_id: row.parent_client_id || clientId,
        client_name: row.client_name,
        is_enabled: effectiveEnabled,
        has_store: row.sc_id ? true : false,
        store_title: row.store_title || `Loja Corporativa - ${row.client_name}`,
        welcome_message: row.welcome_message || 'Escolha seus itens personalizados com layout aprovado e faça seu pedido de produção.',
        payment_methods: parsePaymentMethods(row.payment_methods_json)
      });
    }
  );
});

// Criar ou atualizar configuração da loja de um cliente (incluindo Meios de Pagamento / Faturamento)
router.post('/client-config/:clientId', (req, res) => {
  const clientId = parseInt(req.params.clientId, 10);
  const { is_enabled, store_title, welcome_message, payment_methods } = req.body;

  if (!clientId) return res.status(400).json({ error: 'ID do cliente inválido.' });

  db.get(`SELECT * FROM store_settings_client WHERE client_id = ?`, [clientId], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });

    const enabledVal = is_enabled !== undefined
      ? (is_enabled ? 1 : 0)
      : (existing ? existing.is_enabled : 1);

    const nextTitle = store_title !== undefined ? store_title : (existing ? existing.store_title : '');
    const nextWelcome = welcome_message !== undefined ? welcome_message : (existing ? existing.welcome_message : '');
    const nextPaymentJson = Array.isArray(payment_methods)
      ? JSON.stringify(payment_methods)
      : (existing && existing.payment_methods_json ? existing.payment_methods_json : JSON.stringify(['30 DIAS BOLETO']));

    if (existing) {
      db.run(
        `UPDATE store_settings_client SET is_enabled = ?, store_title = ?, welcome_message = ?, payment_methods_json = ? WHERE client_id = ?`,
        [enabledVal, nextTitle || '', nextWelcome || '', nextPaymentJson, clientId],
        function (uErr) {
          if (uErr) return res.status(500).json({ error: uErr.message });
          res.json({
            message: 'Configuração e meios de faturamento atualizados com sucesso!',
            client_id: clientId,
            is_enabled: enabledVal,
            payment_methods: parsePaymentMethods(nextPaymentJson)
          });
        }
      );
    } else {
      db.run(
        `INSERT INTO store_settings_client (client_id, is_enabled, store_title, welcome_message, payment_methods_json) VALUES (?, ?, ?, ?, ?)`,
        [clientId, enabledVal, nextTitle || '', nextWelcome || '', nextPaymentJson],
        function (iErr) {
          if (iErr) return res.status(500).json({ error: iErr.message });
          res.status(201).json({
            message: 'Loja e meios de faturamento configurados com sucesso!',
            client_id: clientId,
            is_enabled: enabledVal,
            payment_methods: parsePaymentMethods(nextPaymentJson)
          });
        }
      );
    }
  });
});

// Visão Geral de Todas as Lojas (Para a aba Loja Virtual do Admin)
router.get('/overview', (req, res) => {
  const sql = `
    SELECT 
      c.id as client_id,
      c.name as client_name,
      c.email as client_email,
      c.cnpj_cpf,
      COALESCE(sc.is_enabled, 0) as is_enabled,
      sc.store_title,
      sc.welcome_message,
      (SELECT COUNT(*) FROM store_products sp WHERE sp.client_id = c.id) as products_count,
      (SELECT COUNT(*) FROM store_orders so WHERE so.client_id = c.id) as orders_count,
      (SELECT COALESCE(SUM(so.total_amount), 0) FROM store_orders so WHERE so.client_id = c.id AND so.status != 'cancelado') as total_revenue
    FROM clients c
    LEFT JOIN store_settings_client sc ON c.id = sc.client_id
    WHERE c.role = 'client'
    ORDER BY c.name ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// =========================================================================
// 2. PRODUTOS DA LOJA VIRTUAL (FAIXAS: 20 / 50 / 100 / 200 / 500 / 1000)
// =========================================================================

router.get('/products', (req, res) => {
  let sql = `
    SELECT sp.*, c.name as client_name
    FROM store_products sp
    LEFT JOIN clients c ON sp.client_id = c.id
  `;
  const params = [];

  if (req.isClient) {
    sql += ` WHERE sp.client_id = ? AND sp.status = 'active'`;
    params.push(req.rootClientId || req.clientId);
  } else if (req.query.client_id) {
    sql += ` WHERE sp.client_id = ?`;
    params.push(parseInt(req.query.client_id, 10));
  }

  sql += ` ORDER BY sp.created_at DESC`;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const parsed = (rows || []).map(r => {
      let images = [];
      try {
        images = r.images_json ? JSON.parse(r.images_json) : [];
      } catch (e) {
        images = [];
      }
      if (images.length === 0 && r.image_url) {
        images = [r.image_url];
      }
      return { ...r, images };
    });

    res.json(parsed);
  });
});

// Cadastrar produto na Loja do Cliente
router.post('/products', (req, res) => {
  const {
    client_id,
    code,
    name,
    description,
    image_url,
    images,
    price_20,
    price_50,
    price_100,
    price_200,
    price_500,
    price_1000,
    unit_weight,
    unit_height,
    unit_width,
    unit_length,
    max_qty_per_box,
    box_weight,
    box_height,
    box_width,
    box_length,
    production_days
  } = req.body;

  const targetClientId = getEffectiveClientId(req, client_id);

  if (!name) {
    return res.status(400).json({ error: 'O nome do produto é obrigatório.' });
  }

  const sku = code || ('LJ-' + Date.now().toString(36).toUpperCase());
  const imagesArr = Array.isArray(images) && images.length > 0 ? images : (image_url ? [image_url] : []);
  const mainImage = image_url || (imagesArr.length > 0 ? imagesArr[0] : '');

  // Garantir que a loja do cliente esteja ativada automaticamente ao cadastrar produto
  if (targetClientId) {
    db.run(
      `INSERT OR IGNORE INTO store_settings_client (client_id, is_enabled) VALUES (?, 1)`,
      [targetClientId]
    );
  }

  const sql = `
    INSERT INTO store_products (
      client_id, code, name, description, image_url, images_json,
      price_20, price_50, price_100, price_200, price_500, price_1000,
      unit_weight, unit_height, unit_width, unit_length,
      max_qty_per_box, box_weight, box_height, box_width, box_length,
      production_days
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      targetClientId,
      sku,
      name,
      description || '',
      mainImage,
      JSON.stringify(imagesArr),
      parseFloat(price_20) || 0,
      parseFloat(price_50) || 0,
      parseFloat(price_100) || 0,
      parseFloat(price_200) || 0,
      parseFloat(price_500) || 0,
      parseFloat(price_1000) || 0,
      parseFloat(unit_weight) || 0.3,
      parseFloat(unit_height) || 15,
      parseFloat(unit_width) || 10,
      parseFloat(unit_length) || 10,
      parseInt(max_qty_per_box, 10) || 20,
      parseFloat(box_weight) || 0.5,
      parseFloat(box_height) || 30,
      parseFloat(box_width) || 40,
      parseFloat(box_length) || 40,
      parseInt(production_days, 10) || 7
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({
        message: 'Produto cadastrado na loja do cliente com sucesso!',
        id: this.lastID
      });
    }
  );
});

// Atualizar produto da Loja
router.put('/products/:id', (req, res) => {
  const prodId = parseInt(req.params.id, 10);
  const {
    client_id,
    code,
    name,
    description,
    image_url,
    images,
    price_20,
    price_50,
    price_100,
    price_200,
    price_500,
    price_1000,
    unit_weight,
    unit_height,
    unit_width,
    unit_length,
    max_qty_per_box,
    box_weight,
    box_height,
    box_width,
    box_length,
    production_days,
    status
  } = req.body;

  const imagesArr = Array.isArray(images) && images.length > 0 ? images : (image_url ? [image_url] : []);
  const mainImage = image_url || (imagesArr.length > 0 ? imagesArr[0] : '');

  const sql = `
    UPDATE store_products SET
      client_id = COALESCE(?, client_id),
      code = ?,
      name = ?,
      description = ?,
      image_url = ?,
      images_json = ?,
      price_20 = ?,
      price_50 = ?,
      price_100 = ?,
      price_200 = ?,
      price_500 = ?,
      price_1000 = ?,
      unit_weight = ?,
      unit_height = ?,
      unit_width = ?,
      unit_length = ?,
      max_qty_per_box = ?,
      box_weight = ?,
      box_height = ?,
      box_width = ?,
      box_length = ?,
      production_days = ?,
      status = COALESCE(?, status)
    WHERE id = ?
  `;

  db.run(
    sql,
    [
      client_id ? parseInt(client_id, 10) : null,
      code || '',
      name || '',
      description || '',
      mainImage,
      JSON.stringify(imagesArr),
      parseFloat(price_20) || 0,
      parseFloat(price_50) || 0,
      parseFloat(price_100) || 0,
      parseFloat(price_200) || 0,
      parseFloat(price_500) || 0,
      parseFloat(price_1000) || 0,
      parseFloat(unit_weight) || 0.3,
      parseFloat(unit_height) || 15,
      parseFloat(unit_width) || 10,
      parseFloat(unit_length) || 10,
      parseInt(max_qty_per_box, 10) || 20,
      parseFloat(box_weight) || 0.5,
      parseFloat(box_height) || 30,
      parseFloat(box_width) || 40,
      parseFloat(box_length) || 40,
      parseInt(production_days, 10) || 7,
      status || 'active',
      prodId
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Produto da loja atualizado com sucesso!' });
    }
  );
});

// Excluir produto da Loja
router.delete('/products/:id', (req, res) => {
  const prodId = parseInt(req.params.id, 10);
  db.run(`DELETE FROM store_products WHERE id = ?`, [prodId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Produto removido da loja com sucesso!' });
  });
});

// =========================================================================
// 3. CARRINHO DE COMPRAS DA LOJA VIRTUAL
// =========================================================================

const VALID_TIERS = [20, 50, 100, 200, 500, 1000];

function getTierUnitPrice(product, qtyInput) {
  const qty = parseInt(qtyInput, 10) || 1;
  const p20 = parseFloat(product.price_20) || 0;
  const p50 = parseFloat(product.price_50) || p20;
  const p100 = parseFloat(product.price_100) || p50;
  const p200 = parseFloat(product.price_200) || p100;
  const p500 = parseFloat(product.price_500) || p200;
  const p1000 = parseFloat(product.price_1000) || p500;

  if (qty >= 1000) return p1000;
  if (qty >= 500) return p500;
  if (qty >= 200) return p200;
  if (qty >= 100) return p100;
  if (qty >= 50) return p50;
  return p20;
}

router.get('/cart', (req, res) => {
  const clientId = getEffectiveClientId(req);

  const sql = `
    SELECT 
      sc.id as cart_item_id,
      sc.client_id,
      sc.store_product_id,
      sc.tier_qty,
      sc.unit_price,
      sc.total_price,
      sp.code,
      sp.name,
      sp.description,
      sp.image_url,
      sp.images_json,
      sp.price_20, sp.price_50, sp.price_100, sp.price_200, sp.price_500, sp.price_1000,
      sp.unit_weight, sp.unit_height, sp.unit_width, sp.unit_length,
      sp.max_qty_per_box, sp.box_weight, sp.box_height, sp.box_width, sp.box_length,
      sp.production_days
    FROM store_cart_items sc
    JOIN store_products sp ON sc.store_product_id = sp.id
    WHERE sc.client_id = ?
    ORDER BY sc.created_at ASC
  `;

  db.all(sql, [clientId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const items = rows || [];
    const subtotal = items.reduce((acc, item) => acc + (parseFloat(item.total_price) || 0), 0);
    const totalPieces = items.reduce((acc, item) => acc + (parseInt(item.tier_qty, 10) || 0), 0);

    const configOwnerId = req.rootClientId || clientId;
    db.get(`SELECT payment_methods_json FROM store_settings_client WHERE client_id = ?`, [configOwnerId], (cfgErr, cfgRow) => {
      const paymentMethods = parsePaymentMethods(cfgRow ? cfgRow.payment_methods_json : null);
      res.json({
        items,
        subtotal: parseFloat(subtotal.toFixed(2)),
        total_pieces: totalPieces,
        payment_methods: paymentMethods
      });
    });
  });
});

// Adicionar ou atualizar item no carrinho da loja
router.post('/cart', (req, res) => {
  const { store_product_id, tier_qty, client_id } = req.body;
  const effectiveClientId = getEffectiveClientId(req, client_id);
  const tier = parseInt(tier_qty, 10);

  if (!store_product_id || isNaN(tier) || tier < 1) {
    return res.status(400).json({ error: 'Informe uma quantidade válida (mínimo 1 peça).' });
  }

  db.get(`SELECT * FROM store_products WHERE id = ?`, [store_product_id], (err, product) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado na loja.' });

    const unitPrice = getTierUnitPrice(product, tier);
    if (unitPrice <= 0) {
      return res.status(400).json({ error: `Esta quantidade (${tier} pçs) não possui valor configurado para este produto.` });
    }

    const totalPrice = parseFloat((unitPrice * tier).toFixed(2));

    // Verificar se já está no carrinho para atualizar a quantidade ou inserir
    db.get(
      `SELECT id FROM store_cart_items WHERE client_id = ? AND store_product_id = ?`,
      [effectiveClientId, store_product_id],
      (cErr, existing) => {
        if (cErr) return res.status(500).json({ error: cErr.message });

        if (existing) {
          db.run(
            `UPDATE store_cart_items SET tier_qty = ?, unit_price = ?, total_price = ? WHERE id = ?`,
            [tier, unitPrice, totalPrice, existing.id],
            function (uErr) {
              if (uErr) return res.status(500).json({ error: uErr.message });
              res.json({ message: 'Quantidade atualizada no carrinho!' });
            }
          );
        } else {
          db.run(
            `INSERT INTO store_cart_items (client_id, store_product_id, tier_qty, unit_price, total_price) VALUES (?, ?, ?, ?, ?)`,
            [effectiveClientId, store_product_id, tier, unitPrice, totalPrice],
            function (iErr) {
              if (iErr) return res.status(500).json({ error: iErr.message });
              res.status(201).json({ message: 'Produto adicionado ao carrinho!', id: this.lastID });
            }
          );
        }
      }
    );
  });
});

// Alterar quantidade (faixa ou digitada livremente) de um item do carrinho
router.put('/cart/:id', (req, res) => {
  const cartItemId = parseInt(req.params.id, 10);
  const tier = parseInt(req.body.tier_qty, 10);

  if (isNaN(tier) || tier < 1) {
    return res.status(400).json({ error: 'Informe uma quantidade válida (mínimo 1 peça).' });
  }

  db.get(
    `SELECT sc.*, sp.price_20, sp.price_50, sp.price_100, sp.price_200, sp.price_500, sp.price_1000
     FROM store_cart_items sc
     JOIN store_products sp ON sc.store_product_id = sp.id
     WHERE sc.id = ?`,
    [cartItemId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Item não encontrado no carrinho.' });

      const unitPrice = getTierUnitPrice(row, tier);
      const totalPrice = parseFloat((unitPrice * tier).toFixed(2));

      db.run(
        `UPDATE store_cart_items SET tier_qty = ?, unit_price = ?, total_price = ? WHERE id = ?`,
        [tier, unitPrice, totalPrice, cartItemId],
        function (uErr) {
          if (uErr) return res.status(500).json({ error: uErr.message });
          res.json({ message: 'Carrinho atualizado!' });
        }
      );
    }
  );
});

// Remover item do carrinho da loja
router.delete('/cart/:id', (req, res) => {
  const cartItemId = parseInt(req.params.id, 10);
  db.run(`DELETE FROM store_cart_items WHERE id = ?`, [cartItemId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Item removido do carrinho.' });
  });
});

// Limpar carrinho da loja do cliente
router.delete('/cart', (req, res) => {
  const clientId = getEffectiveClientId(req);
  db.run(`DELETE FROM store_cart_items WHERE client_id = ?`, [clientId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Carrinho da loja esvaziado.' });
  });
});

// =========================================================================
// 4. COTAÇÃO DE FRETE PARA A LOJA (OPÇÃO 2: ENVIO NORMAL)
// =========================================================================

router.post('/quote-freight', (req, res) => {
  const { dest_cep, client_id } = req.body;
  const effectiveClientId = getEffectiveClientId(req, client_id);

  if (!dest_cep) {
    return res.status(400).json({ error: 'Informe o CEP de destino para calcular o frete.' });
  }

  db.all("SELECT key, value FROM settings WHERE key IN ('origin_cep', 'default_markup_percent')", (sErr, settingsRows) => {
    if (sErr) return res.status(500).json({ error: sErr.message });

    const settingsMap = {};
    (settingsRows || []).forEach(r => { settingsMap[r.key] = r.value; });
    const originCep = settingsMap.origin_cep || '80000000';
    const effectiveMarkup = parseFloat(settingsMap.default_markup_percent) || 10.0;

    const cartSql = `
      SELECT 
        sc.tier_qty as quantity,
        sp.id, sp.code, sp.name,
        sp.unit_weight, sp.unit_height, sp.unit_width, sp.unit_length,
        sp.max_qty_per_box, sp.box_weight, sp.box_height, sp.box_width, sp.box_length
      FROM store_cart_items sc
      JOIN store_products sp ON sc.store_product_id = sp.id
      WHERE sc.client_id = ?
    `;

    db.all(cartSql, [effectiveClientId], async (cErr, rows) => {
      if (cErr) return res.status(500).json({ error: cErr.message });
      if (!rows || rows.length === 0) {
        return res.status(400).json({ error: 'O carrinho da loja está vazio para cotar frete.' });
      }

      const itemsWithRules = rows.map(r => ({
        product: {
          id: r.id,
          code: r.code,
          name: r.name,
          unit_weight: r.unit_weight || 0.3,
          unit_height: r.unit_height || 15,
          unit_width: r.unit_width || 10,
          unit_length: r.unit_length || 10
        },
        rule: {
          max_qty_per_box: r.max_qty_per_box || 20,
          box_weight: r.box_weight || 0.5,
          box_height: r.box_height || 30,
          box_width: r.box_width || 40,
          box_length: r.box_length || 40
        },
        quantity: r.quantity
      }));

      const calc = calculatePackages(itemsWithRules);
      const packagesToQuote = calc.packages;

      try {
        const quotes = await quoteFreight({
          originCep,
          destCep: dest_cep,
          packages: packagesToQuote,
          markupPercent: effectiveMarkup
        });

        res.json({
          origin_cep: originCep,
          dest_cep,
          packages: packagesToQuote,
          total_volumes: packagesToQuote.length,
          total_weight: parseFloat(packagesToQuote.reduce((a, b) => a + b.weight, 0).toFixed(3)),
          quotes
        });
      } catch (qErr) {
        res.status(500).json({ error: qErr.message });
      }
    });
  });
});

// =========================================================================
// 5. FINALIZAR COMPRA (CHECKOUT) & GESTÃO DE PEDIDOS DA LOJA
// =========================================================================

router.post('/checkout', (req, res) => {
  const {
    client_id,
    delivery_type, // 'flow' ou 'normal'
    recipient_name,
    dest_cep,
    dest_address,
    dest_number,
    dest_complement,
    dest_neighborhood,
    dest_city,
    dest_state,
    selected_carrier,
    selected_service,
    freight_price,
    delivery_days,
    payment_method,
    billing_client_id,
    billing_cnpj,
    billing_name,
    notes
  } = req.body;

  const effectiveClientId = getEffectiveClientId(req, client_id);
  const type = delivery_type === 'normal' ? 'normal' : 'flow';

  if (type === 'normal' && (!dest_cep || !dest_address || !dest_city)) {
    return res.status(400).json({ error: 'Para Envio Normal, preencha o endereço completo de entrega e selecione o frete.' });
  }

  const chosenPaymentMethod = (payment_method && String(payment_method).trim()) || '30 DIAS BOLETO';

  db.get(`SELECT id, name, cnpj_cpf, parent_client_id, branch_number FROM clients WHERE id = ?`, [effectiveClientId], (cErr, buyerClient) => {
    if (cErr || !buyerClient) {
      return res.status(400).json({ error: 'Cliente comprador não identificado.' });
    }

    const isChildBranch = Boolean(buyerClient.parent_client_id);
    const parentClientId = buyerClient.parent_client_id || null;
    const initialOrderStatus = isChildBranch ? 'aguardando_aprovacao_mae' : 'em_aberto';
    const motherApprovalStatus = isChildBranch ? 'pending' : 'approved';

    const finalBillingClientId = billing_client_id ? parseInt(billing_client_id, 10) : buyerClient.id;
    const finalBillingCnpj = billing_cnpj ? String(billing_cnpj).trim() : (buyerClient.cnpj_cpf || '');
    const finalBillingName = billing_name ? String(billing_name).trim() : buyerClient.name;

    const cartSql = `
      SELECT 
        sc.*,
        sp.code as product_code,
        sp.name as product_name,
        sp.image_url as product_image,
        COALESCE(sp.production_days, 7) as production_days
      FROM store_cart_items sc
      JOIN store_products sp ON sc.store_product_id = sp.id
      WHERE sc.client_id = ?
    `;

    db.all(cartSql, [effectiveClientId], (err, cartItems) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!cartItems || cartItems.length === 0) {
        return res.status(400).json({ error: 'Seu carrinho da loja está vazio.' });
      }

      const subtotalProducts = parseFloat(
        cartItems.reduce((acc, item) => acc + (parseFloat(item.total_price) || 0), 0).toFixed(2)
      );
      const effectiveFreight = type === 'normal' ? (parseFloat(freight_price) || 0) : 0;
      const totalAmount = parseFloat((subtotalProducts + effectiveFreight).toFixed(2));
      const orderCode = 'LOJA-' + Date.now().toString(36).toUpperCase();

      const maxProductionDays = cartItems.reduce(
        (maxD, item) => Math.max(maxD, parseInt(item.production_days, 10) || 7),
        1
      );
      const readyDateObj = new Date(Date.now() + maxProductionDays * 24 * 60 * 60 * 1000);
      const estimatedReadyDateIso = readyDateObj.toISOString();

      const insertOrderSql = `
        INSERT INTO store_orders (
          code, client_id, parent_client_id, billing_client_id, billing_cnpj, billing_name,
          mother_approval_status, delivery_type,
          recipient_name, dest_cep, dest_address, dest_number, dest_complement, dest_neighborhood, dest_city, dest_state,
          selected_carrier, selected_service, freight_price, delivery_days,
          production_days, estimated_ready_date,
          payment_method, payment_status,
          subtotal_products, total_amount, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'em_aberto', ?, ?, ?, ?)
      `;

      db.run(
        insertOrderSql,
        [
          orderCode,
          effectiveClientId,
          parentClientId,
          finalBillingClientId,
          finalBillingCnpj,
          finalBillingName,
          motherApprovalStatus,
          type,
          type === 'normal' ? (recipient_name || '') : 'Estoque Personaliza Flow',
          type === 'normal' ? (dest_cep || '') : '',
          type === 'normal' ? (dest_address || '') : 'Centro Logístico Personaliza Flow (Armazenamento)',
          type === 'normal' ? (dest_number || '') : '',
          type === 'normal' ? (dest_complement || '') : '',
          type === 'normal' ? (dest_neighborhood || '') : '',
          type === 'normal' ? (dest_city || '') : '',
          type === 'normal' ? (dest_state || '') : '',
          type === 'normal' ? (selected_carrier || '') : 'Envio Flow',
          type === 'normal' ? (selected_service || '') : 'Transferência Interna Pós-Produção',
          effectiveFreight,
          type === 'normal' ? (parseInt(delivery_days, 10) || 0) : 0,
          maxProductionDays,
          estimatedReadyDateIso,
          chosenPaymentMethod,
          subtotalProducts,
          totalAmount,
          initialOrderStatus,
          notes || ''
        ],
        function (oErr) {
          if (oErr) return res.status(500).json({ error: oErr.message });
          const orderId = this.lastID;

          const insertItemSql = `
            INSERT INTO store_order_items (
              store_order_id, store_product_id, product_code, product_name, product_image,
              tier_qty, unit_price, total_price, production_days
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          const itemPromises = cartItems.map(item => new Promise((resolve, reject) => {
            db.run(
              insertItemSql,
              [
                orderId,
                item.store_product_id,
                item.product_code,
                item.product_name,
                item.product_image,
                item.tier_qty,
                item.unit_price,
                item.total_price,
                parseInt(item.production_days, 10) || 7
              ],
              (iErr) => iErr ? reject(iErr) : resolve()
            );
          }));

          Promise.all(itemPromises)
            .then(() => {
              db.run(`DELETE FROM store_cart_items WHERE client_id = ?`, [effectiveClientId], () => {
                res.status(201).json({
                  message: isChildBranch
                    ? 'Pedido enviado para aprovação da Conta Mãe (Matriz)!'
                    : 'Pedido realizado com sucesso! Nossa equipe iniciará a conferência e produção.',
                  order_id: orderId,
                  code: orderCode,
                  total_amount: totalAmount,
                  delivery_type: type,
                  status: initialOrderStatus,
                  mother_approval_status: motherApprovalStatus,
                  production_days: maxProductionDays,
                  estimated_ready_date: estimatedReadyDateIso
                });
              });
            })
            .catch(pErr => res.status(500).json({ error: pErr.message }));
        }
      );
    });
  });
});

// Aprovação ou Recusa de Pedido pela Conta Mãe (Matriz)
router.post('/orders/:id/mother-approval', (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const { action, reason } = req.body; // action: 'approve' | 'reject'

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Ação inválida. Informe approve ou reject.' });
  }

  db.get(`SELECT * FROM store_orders WHERE id = ?`, [orderId], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

    if (req.isClient) {
      if (Number(order.parent_client_id) !== Number(req.clientId)) {
        return res.status(403).json({ error: 'Apenas a Conta Mãe vinculada a esta sede pode aprovar ou recusar este pedido.' });
      }
    }

    if (action === 'approve') {
      db.run(
        `UPDATE store_orders SET status = 'em_aberto', mother_approval_status = 'approved', mother_approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [orderId],
        function (uErr) {
          if (uErr) return res.status(500).json({ error: uErr.message });
          res.json({
            success: true,
            message: `Pedido ${order.code} aprovado pela Matriz! Agora seguirá para conferência e produção.`,
            status: 'em_aberto',
            mother_approval_status: 'approved'
          });
        }
      );
    } else {
      db.run(
        `UPDATE store_orders SET status = 'recusado_matriz', mother_approval_status = 'rejected', mother_rejection_reason = ? WHERE id = ?`,
        [reason ? String(reason).trim() : 'Recusado pela Conta Mãe', orderId],
        function (uErr) {
          if (uErr) return res.status(500).json({ error: uErr.message });
          res.json({
            success: true,
            message: `Pedido ${order.code} recusado pela Matriz.`,
            status: 'recusado_matriz',
            mother_approval_status: 'rejected'
          });
        }
      );
    }
  });
});

// Listar pedidos da loja (Conta Mãe vê toda a rede; Sede Filha vê os seus; Admin vê todos)
router.get('/orders', (req, res) => {
  let sql = `
    SELECT so.*,
           c.name as client_name,
           c.branch_number as client_branch,
           c.cnpj_cpf as client_cnpj,
           c.email as client_email,
           c.phone as client_phone
    FROM store_orders so
    LEFT JOIN clients c ON so.client_id = c.id
  `;
  const params = [];

  if (req.isClient) {
    if (!req.parentClientId) {
      // Conta Mãe: vê os seus próprios pedidos e todos os pedidos das sedes filhas
      sql += ` WHERE (so.client_id = ? OR so.parent_client_id = ? OR so.billing_client_id = ?)`;
      params.push(req.clientId, req.clientId, req.clientId);
    } else {
      // Sede Filha: vê os seus pedidos ou faturados para ela
      sql += ` WHERE (so.client_id = ? OR so.billing_client_id = ?)`;
      params.push(req.clientId, req.clientId);
    }
  } else if (req.query.client_id) {
    const cid = parseInt(req.query.client_id, 10);
    sql += ` WHERE (so.client_id = ? OR so.parent_client_id = ? OR so.billing_client_id = ?)`;
    params.push(cid, cid, cid);
  }

  sql += ` ORDER BY so.created_at DESC`;

  db.all(sql, params, (err, orders) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!orders || orders.length === 0) return res.json([]);

    const orderIds = orders.map(o => o.id);
    const placeholders = orderIds.map(() => '?').join(',');

    db.all(
      `SELECT soi.*, COALESCE(soi.production_days, sp.production_days, 7) as effective_production_days,
              COALESCE(NULLIF(soi.product_image, ''), sp.image_url) as resolved_product_image
       FROM store_order_items soi
       LEFT JOIN store_products sp ON soi.store_product_id = sp.id
       WHERE soi.store_order_id IN (${placeholders})`,
      orderIds,
      (iErr, items) => {
        if (iErr) return res.status(500).json({ error: iErr.message });

        const itemsByOrder = {};
        (items || []).forEach(it => {
          if (!itemsByOrder[it.store_order_id]) itemsByOrder[it.store_order_id] = [];
          itemsByOrder[it.store_order_id].push({
            ...it,
            production_days: it.effective_production_days || 7,
            product_image: it.resolved_product_image || it.product_image || ''
          });
        });

        const enriched = orders.map(o => {
          const orderItems = itemsByOrder[o.id] || [];
          const prodDays = o.production_days || orderItems.reduce((m, it) => Math.max(m, parseInt(it.production_days, 10) || 7), 7);
          let estReady = o.estimated_ready_date;
          if (!estReady && o.created_at) {
            const baseDate = new Date(o.created_at);
            if (!isNaN(baseDate.getTime())) {
              estReady = new Date(baseDate.getTime() + prodDays * 24 * 60 * 60 * 1000).toISOString();
            }
          }
          return {
            ...o,
            production_days: prodDays,
            estimated_ready_date: estReady,
            items: orderItems
          };
        });

        res.json(enriched);
      }
    );
  });
});

// Atualizar Status do Pedido de Produção (Admin) + Integração Automática com Estoque Flow
router.patch('/orders/:id/status', (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const { status, tracking_code } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Informe o novo status do pedido.' });
  }

  db.get(`SELECT * FROM store_orders WHERE id = ?`, [orderId], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const newTracking = tracking_code !== undefined ? tracking_code : order.tracking_code;

    db.run(
      `UPDATE store_orders SET status = ?, tracking_code = ? WHERE id = ?`,
      [status, newTracking || '', orderId],
      function (uErr) {
        if (uErr) return res.status(500).json({ error: uErr.message });

        // Se o pedido for 'flow' e o status mudar para 'produzido_estoque_flow' e ainda não tiver sido sincronizado ao estoque Flow:
        if (order.delivery_type === 'flow' && status === 'produzido_estoque_flow' && !order.synced_to_flow) {
          syncOrderItemsToFlowInventory(order, (syncErr) => {
            if (syncErr) {
              console.error('Erro ao sincronizar pedido com estoque Flow:', syncErr);
            }
            res.json({
              message: 'Status atualizado e produtos adicionados automaticamente ao Estoque Flow do cliente!',
              synced_to_flow: true
            });
          });
        } else {
          res.json({ message: 'Status do pedido da loja atualizado com sucesso!' });
        }
      }
    );
  });
});

// Atualizar Status de Faturamento/Pagamento do Pedido da Loja (Admin)
router.patch('/orders/:id/payment-status', (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const { payment_status } = req.body;
  const nextPaymentStatus = ['pago', 'aguardando_pagamento', 'em_aberto'].includes(payment_status)
    ? payment_status
    : 'em_aberto';

  const statusMessages = {
    pago: 'Pagamento aprovado (Pago / Quitado)!',
    aguardando_pagamento: 'Cobrança marcada como Aguard. Pagamento!',
    em_aberto: 'Faturamento reaberto (Em Aberto)!'
  };

  db.run(
    `UPDATE store_orders SET payment_status = ? WHERE id = ?`,
    [nextPaymentStatus, orderId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        message: statusMessages[nextPaymentStatus] || 'Status de pagamento atualizado!',
        payment_status: nextPaymentStatus
      });
    }
  );
});

// Excluir pedido da loja (Admin)
router.delete('/orders/:id', (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  db.run(`DELETE FROM store_orders WHERE id = ?`, [orderId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Pedido excluído com sucesso.' });
  });
});

// Função auxiliar: Quando um pedido "Envio Flow" é concluído na produção,
// transfere/cria os produtos no estoque Flow do cliente (`products` + `packaging_rules`)
function syncOrderItemsToFlowInventory(order, callback) {
  db.all(`SELECT * FROM store_order_items WHERE store_order_id = ?`, [order.id], (err, items) => {
    if (err || !items || items.length === 0) return callback(err);

    const tasks = items.map(item => new Promise((resolve) => {
      db.get(`SELECT * FROM store_products WHERE id = ?`, [item.store_product_id], (spErr, sp) => {
        const unitWeight = sp ? sp.unit_weight : 0.3;
        const unitHeight = sp ? sp.unit_height : 15;
        const unitWidth = sp ? sp.unit_width : 10;
        const unitLength = sp ? sp.unit_length : 10;
        const maxQtyBox = sp ? sp.max_qty_per_box : 20;
        const boxWeight = sp ? sp.box_weight : 0.5;
        const boxHeight = sp ? sp.box_height : 30;
        const boxWidth = sp ? sp.box_width : 40;
        const boxLength = sp ? sp.box_length : 40;
        const description = sp ? sp.description : '';

        const flowOwnerClientId = order.parent_client_id || order.client_id;

        // Verificar se já existe produto no estoque Flow desse cliente com mesmo nome ou código
        db.get(
          `SELECT * FROM products WHERE client_id = ? AND (code = ? OR name = ?)`,
          [flowOwnerClientId, item.product_code, item.product_name],
          (pErr, existingProd) => {
            if (existingProd) {
              db.run(
                `UPDATE products SET stock_qty = COALESCE(stock_qty, 0) + ? WHERE id = ?`,
                [item.tier_qty, existingProd.id],
                () => resolve()
              );
            } else {
              const flowCode = `${item.product_code || 'FLW'}-${flowOwnerClientId}-${Date.now().toString(36).slice(-3).toUpperCase()}`;
              db.run(
                `INSERT INTO products (
                  client_id, code, name, order_number, description, image_url, stock_qty,
                  unit_weight, unit_height, unit_width, unit_length, unit_measure
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'un')`,
                [
                  flowOwnerClientId,
                  flowCode,
                  item.product_name,
                  order.code,
                  description,
                  item.product_image || '',
                  item.tier_qty,
                  unitWeight,
                  unitHeight,
                  unitWidth,
                  unitLength
                ],
                function (insErr) {
                  if (!insErr && this.lastID) {
                    db.run(
                      `INSERT OR IGNORE INTO packaging_rules (product_id, max_qty_per_box, box_weight, box_height, box_width, box_length)
                       VALUES (?, ?, ?, ?, ?, ?)`,
                      [this.lastID, maxQtyBox, boxWeight, boxHeight, boxWidth, boxLength],
                      () => resolve()
                    );
                  } else {
                    resolve();
                  }
                }
              );
            }
          }
        );
      });
    }));

    Promise.all(tasks).then(() => {
      db.run(`UPDATE store_orders SET synced_to_flow = 1 WHERE id = ?`, [order.id], () => callback(null));
    });
  });
}

module.exports = router;
