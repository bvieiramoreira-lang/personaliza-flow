const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database');

// Configuração do Multer para Upload de Imagens de Produtos
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
    cb(null, 'prod-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

// Rota de Upload de Imagem do Produto
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo de imagem foi enviado.' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

// Listar produtos (suporta filtro por client_id e isolamento multi-tenant)
router.get('/', (req, res) => {
  let query = `
    SELECT 
      p.*,
      pr.max_qty_per_box,
      pr.box_weight,
      pr.box_height,
      pr.box_width,
      pr.box_length
    FROM products p
    LEFT JOIN packaging_rules pr ON p.id = pr.product_id
  `;
  const params = [];

  if (req.isClient) {
    // Cliente autenticado: visualiza OBRIGATORIAMENTE apenas seus próprios produtos
    query += ` WHERE p.client_id = ?`;
    params.push(req.clientId);
  } else if (req.clientId) {
    // Administrador filtrando por cliente específico
    query += ` WHERE p.client_id = ?`;
    params.push(req.clientId);
  }

  query += ` ORDER BY p.created_at DESC`;

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// Cadastrar novo produto + regra de embalagem
router.post('/', (req, res) => {
  const {
    client_id,
    code,
    name,
    order_number,
    description,
    image_url,
    unit_weight,
    unit_height,
    unit_width,
    unit_length,
    unit_measure,
    max_qty_per_box,
    box_weight,
    box_height,
    box_width,
    box_length
  } = req.body;

  const targetClientId = req.isClient ? req.clientId : (client_id || req.headers['x-target-client-id'] || null);

  if (!code || !name) {
    return res.status(400).json({ error: 'Código e Nome do produto são obrigatórios.' });
  }

  const rawStock = req.body.stock_qty;
  const parsedStock = (rawStock !== undefined && rawStock !== null && rawStock !== '') ? parseInt(rawStock, 10) : 100;
  const stockQty = isNaN(parsedStock) ? 100 : Math.max(0, parsedStock);

  const insertProduct = `
    INSERT INTO products (
      client_id, code, name, order_number, description, image_url, stock_qty,
      unit_weight, unit_height, unit_width, unit_length, unit_measure
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    insertProduct,
    [
      targetClientId,
      code,
      name,
      order_number || '',
      description || '',
      image_url || '',
      stockQty,
      parseFloat(unit_weight) || 0,
      parseFloat(unit_height) || 0,
      parseFloat(unit_width) || 0,
      parseFloat(unit_length) || 0,
      unit_measure || 'un'
    ],
    function (err) {
      if (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({
            error: `O Código / SKU '${code}' já está cadastrado no sistema. Por favor, informe um SKU / código diferente.`
          });
        }
        return res.status(400).json({ error: err.message });
      }

      const productId = this.lastID;

      // Inserir Regra de Embalagem
      const insertRule = `
        INSERT INTO packaging_rules (
          product_id, max_qty_per_box, box_weight, box_height, box_width, box_length
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.run(
        insertRule,
        [
          productId,
          parseInt(max_qty_per_box, 10) || 1,
          parseFloat(box_weight) || 0.2,
          parseFloat(box_height) || 10,
          parseFloat(box_width) || 10,
          parseFloat(box_length) || 10
        ],
        (ruleErr) => {
          if (ruleErr) {
            return res.status(500).json({ error: ruleErr.message });
          }

          res.status(201).json({
            message: 'Produto cadastrado com sucesso!',
            id: productId
          });
        }
      );
    }
  );
});

// Atualizar produto + regra de embalagem
router.put('/:id', (req, res) => {
  const productId = req.params.id;

  const proceedUpdate = () => {
    const {
      code,
      name,
      order_number,
      description,
      image_url,
      unit_weight,
      unit_height,
      unit_width,
      unit_length,
      unit_measure,
      max_qty_per_box,
      box_weight,
      box_height,
      box_width,
      box_length
    } = req.body;

    const rawStock = req.body.stock_qty;
    const parsedStock = (rawStock !== undefined && rawStock !== null && rawStock !== '') ? parseInt(rawStock, 10) : null;

    let updateProduct;
    let updateParams;

    if (parsedStock !== null && !isNaN(parsedStock)) {
      const stockQty = Math.max(0, parsedStock);
      updateProduct = `
        UPDATE products SET
          code = ?, name = ?, order_number = ?, description = ?, image_url = ?, stock_qty = ?,
          unit_weight = ?, unit_height = ?, unit_width = ?, unit_length = ?, unit_measure = ?
        WHERE id = ?
      `;
      updateParams = [
        code,
        name,
        order_number || '',
        description || '',
        image_url || '',
        stockQty,
        parseFloat(unit_weight) || 0,
        parseFloat(unit_height) || 0,
        parseFloat(unit_width) || 0,
        parseFloat(unit_length) || 0,
        unit_measure || 'un',
        productId
      ];
    } else {
      updateProduct = `
        UPDATE products SET
          code = ?, name = ?, order_number = ?, description = ?, image_url = ?,
          unit_weight = ?, unit_height = ?, unit_width = ?, unit_length = ?, unit_measure = ?
        WHERE id = ?
      `;
      updateParams = [
        code,
        name,
        order_number || '',
        description || '',
        image_url || '',
        parseFloat(unit_weight) || 0,
        parseFloat(unit_height) || 0,
        parseFloat(unit_width) || 0,
        parseFloat(unit_length) || 0,
        unit_measure || 'un',
        productId
      ];
    }

    db.run(
      updateProduct,
      updateParams,
      function (err) {
        if (err) {
          if (err.message && err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({
              error: `O Código / SKU '${code}' já está em uso por outro produto. Por favor, informe um SKU diferente.`
            });
          }
          return res.status(400).json({ error: err.message });
        }

        // Upsert Regra de Embalagem
        const upsertRule = `
          INSERT INTO packaging_rules (
            product_id, max_qty_per_box, box_weight, box_height, box_width, box_length
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(product_id) DO UPDATE SET
            max_qty_per_box = excluded.max_qty_per_box,
            box_weight = excluded.box_weight,
            box_height = excluded.box_height,
            box_width = excluded.box_width,
            box_length = excluded.box_length,
            updated_at = CURRENT_TIMESTAMP
        `;

        db.run(
          upsertRule,
          [
            productId,
            parseInt(max_qty_per_box, 10) || 1,
            parseFloat(box_weight) || 0.2,
            parseFloat(box_height) || 10,
            parseFloat(box_width) || 10,
            parseFloat(box_length) || 10
          ],
          (ruleErr) => {
            if (ruleErr) {
              return res.status(500).json({ error: ruleErr.message });
            }

            res.json({ message: 'Produto e Regra Logística atualizados!' });
          }
        );
      }
    );
  };

  if (req.isClient) {
    db.get('SELECT client_id FROM products WHERE id = ?', [productId], (checkErr, prod) => {
      if (checkErr) return res.status(500).json({ error: checkErr.message });
      if (!prod || prod.client_id !== req.clientId) {
        return res.status(403).json({ error: 'Você não tem permissão para editar este produto.' });
      }
      proceedUpdate();
    });
  } else {
    proceedUpdate();
  }
});

// Deletar produto
router.delete('/:id', (req, res) => {
  const productId = req.params.id;

  const proceedDelete = () => {
    db.serialize(() => {
      db.run('DELETE FROM packaging_rules WHERE product_id = ?', [productId]);
      db.run('DELETE FROM cart_items WHERE product_id = ?', [productId]);
      db.run('DELETE FROM shipment_items WHERE product_id = ?', [productId]);
      db.run('DELETE FROM products WHERE id = ?', [productId], function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Produto removido com sucesso!' });
      });
    });
  };

  if (req.isClient) {
    db.get('SELECT client_id FROM products WHERE id = ?', [productId], (checkErr, prod) => {
      if (checkErr) return res.status(500).json({ error: checkErr.message });
      if (!prod || prod.client_id !== req.clientId) {
        return res.status(403).json({ error: 'Você não tem permissão para excluir este produto.' });
      }
      proceedDelete();
    });
  } else {
    proceedDelete();
  }
});

module.exports = router;
