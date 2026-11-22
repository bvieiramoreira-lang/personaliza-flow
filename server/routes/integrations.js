const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database');
const { calculatePackages } = require('../services/packagingEngine');
const { quoteFreight } = require('../services/freightService');

function generateApiKey() {
  return 'pflow_live_' + crypto.randomBytes(18).toString('hex');
}

function generateWebhookSecret() {
  return 'whsec_' + crypto.randomBytes(16).toString('hex');
}

function getStatusLabel(status) {
  const map = {
    em_aberto: 'Em aberto (Recebido / Aguardando conferência)',
    quoted: 'Em aberto',
    separacao: 'Em separação',
    em_preparacao: 'Em separação',
    a_caminho: 'A caminho (Despachado)',
    dispatched: 'A caminho (Despachado)',
    entregue: 'Entregue',
    delivered: 'Entregue'
  };
  return map[status] || status || 'Em aberto';
}

function ensureClientIntegration(clientId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM client_integrations WHERE client_id = ?', [clientId], (err, row) => {
      if (err) return reject(err);
      if (row) return resolve(row);

      const newKey = generateApiKey();
      const newSecret = generateWebhookSecret();
      db.run(
        `INSERT INTO client_integrations (client_id, api_key, webhook_url, webhook_secret, default_freight_rule, is_active)
         VALUES (?, ?, '', ?, 'cheapest', 1)`,
        [clientId, newKey, newSecret],
        function (insErr) {
          if (insErr) return reject(insErr);
          db.get('SELECT * FROM client_integrations WHERE id = ?', [this.lastID], (gErr, created) => {
            if (gErr) return reject(gErr);
            resolve(created);
          });
        }
      );
    });
  });
}

// Dispara Webhook de saída para o site do cliente (ex: Banlek) quando status ou rastreio mudam
async function dispatchClientWebhook(shipmentId, eventType = 'shipment.status_updated') {
  return new Promise((resolve) => {
    db.get('SELECT * FROM shipments WHERE id = ?', [shipmentId], async (err, shipment) => {
      if (err || !shipment || !shipment.client_id) {
        return resolve({ skipped: true, reason: 'Remessa sem cliente vinculado.' });
      }

      const targetClientId = shipment.parent_client_id || shipment.client_id;
      db.get('SELECT * FROM client_integrations WHERE client_id = ?', [targetClientId], async (iErr, config) => {
        if (iErr || !config || !config.is_active || !config.webhook_url || !config.webhook_url.trim()) {
          return resolve({ skipped: true, reason: 'Cliente sem URL de Webhook ativa.' });
        }

        const webhookUrl = config.webhook_url.trim();
        const payload = {
          event: eventType,
          shipment_id: shipment.id,
          shipment_code: shipment.code,
          external_order_id: shipment.external_order_id || null,
          origin_channel: shipment.origin_channel || 'manual',
          status: shipment.status,
          status_label: getStatusLabel(shipment.status),
          tracking_code: shipment.tracking_code || null,
          carrier: shipment.selected_carrier || null,
          service: shipment.selected_service || null,
          delivery_days: shipment.delivery_days || null,
          total_volumes: shipment.total_volumes || 1,
          total_weight: shipment.total_weight || 0,
          freight_price: shipment.final_freight_price || 0,
          recipient: {
            name: shipment.recipient_name || '',
            document: shipment.recipient_document || null,
            phone: shipment.recipient_phone || null,
            email: shipment.recipient_email || null
          },
          destination: {
            cep: shipment.dest_cep || '',
            address: shipment.dest_address || '',
            number: shipment.dest_number || '',
            complement: shipment.dest_complement || '',
            neighborhood: shipment.dest_neighborhood || '',
            city: shipment.dest_city || '',
            state: shipment.dest_state || ''
          },
          updated_at: new Date().toISOString()
        };

        const payloadStr = JSON.stringify(payload);
        let responseStatus = 0;
        let responseBody = '';
        let logStatus = 'success';

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);

          const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'PersonalizaFlow-Webhook/1.0',
            'X-PersonalizaFlow-Event': eventType
          };
          if (config.webhook_secret) {
            headers['X-PersonalizaFlow-Secret'] = config.webhook_secret;
            const signature = crypto
              .createHmac('sha256', config.webhook_secret)
              .update(payloadStr)
              .digest('hex');
            headers['X-PersonalizaFlow-Signature'] = `sha256=${signature}`;
          }

          const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers,
            body: payloadStr,
            signal: controller.signal
          });
          clearTimeout(timer);

          responseStatus = resp.status;
          const text = await resp.text();
          responseBody = (text || '').slice(0, 500);
          if (!resp.ok) {
            logStatus = 'error';
          }
        } catch (fetchErr) {
          responseStatus = 0;
          responseBody = fetchErr.message || 'Falha de conexão com a URL de Webhook.';
          logStatus = 'error';
        }

        db.run(
          `INSERT INTO integration_logs (
            client_id, direction, event_type, external_order_id,
            shipment_id, shipment_code, payload_json, response_status, response_body, status
          ) VALUES (?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            targetClientId,
            eventType,
            shipment.external_order_id || null,
            shipment.id,
            shipment.code,
            payloadStr,
            responseStatus,
            responseBody,
            logStatus
          ],
          () => {
            resolve({
              sent: logStatus === 'success',
              status_code: responseStatus,
              response_body: responseBody,
              log_status: logStatus
            });
          }
        );
      });
    });
  });
}

// ============================================================================
// 1. ROTAS DO PAINEL INTERNO (EXCLUSIVO ADMIN DO FLOW)
// ============================================================================

function requireFlowAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador do Flow.' });
  }
  next();
}

function resolvePanelTargetClientId(req) {
  if (!req.isAdmin) {
    return null;
  }
  if (req.query && req.query.client_id) {
    return parseInt(req.query.client_id, 10);
  }
  if (req.body && req.body.client_id) {
    return parseInt(req.body.client_id, 10);
  }
  if (req.clientId) {
    return parseInt(req.clientId, 10);
  }
  return null;
}

// GET /api/integrations/config - Obter credenciais, produtos (SKUs Flow) e logs do cliente
router.get('/config', requireFlowAdmin, async (req, res) => {
  try {
    const clientsList = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, name, email, cnpj_cpf, branch_number, parent_client_id
         FROM clients
         WHERE role = 'client' AND status = 'active' AND parent_client_id IS NULL
         ORDER BY name ASC`,
        [],
        (err, rows) => (err ? reject(err) : resolve(rows || []))
      );
    });

    let targetClientId = resolvePanelTargetClientId(req);
    if (!targetClientId && clientsList.length > 0) {
      targetClientId = clientsList[0].id;
    }

    if (!targetClientId) {
      return res.json({
        clients_list: clientsList,
        integration: null,
        products: [],
        logs: []
      });
    }

    const clientRow = await new Promise((resolve) => {
      db.get('SELECT id, name, email, cnpj_cpf FROM clients WHERE id = ?', [targetClientId], (err, r) => resolve(r || null));
    });

    const integration = await ensureClientIntegration(targetClientId);

    const products = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          p.id, p.code, p.name, p.description, p.stock_qty as stock_quantity, p.stock_qty, p.image_url,
          p.unit_weight, p.unit_height, p.unit_width, p.unit_length,
          pr.max_qty_per_box, pr.box_weight, pr.box_height, pr.box_width, pr.box_length
        FROM products p
        LEFT JOIN packaging_rules pr ON p.id = pr.product_id
        WHERE p.client_id = ?
        ORDER BY p.code ASC
      `;
      db.all(sql, [targetClientId], (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });

    const logs = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM integration_logs WHERE client_id = ? ORDER BY id DESC LIMIT 40`,
        [targetClientId],
        (err, rows) => (err ? reject(err) : resolve(rows || []))
      );
    });

    res.json({
      clients_list: req.isClient ? [] : clientsList,
      client: clientRow,
      integration,
      products,
      logs
    });
  } catch (err) {
    console.error('Erro em GET /api/integrations/config:', err);
    res.status(500).json({ error: 'Erro ao carregar configurações de integração.' });
  }
});

// PUT /api/integrations/config - Salvar Webhook URL, Secret, Regra de Frete e Status
router.put('/config', requireFlowAdmin, async (req, res) => {
  try {
    const targetClientId = resolvePanelTargetClientId(req);
    if (!targetClientId) {
      return res.status(400).json({ error: 'Selecione um cliente para salvar a configuração.' });
    }

    await ensureClientIntegration(targetClientId);

    const webhookUrl = (req.body.webhook_url || '').trim();
    const webhookSecret = (req.body.webhook_secret || '').trim();
    const defaultFreightRule = ['cheapest', 'fastest'].includes(req.body.default_freight_rule)
      ? req.body.default_freight_rule
      : 'cheapest';
    const isActive = (req.body.is_active === false || req.body.is_active === 0 || req.body.is_active === '0') ? 0 : 1;

    db.run(
      `UPDATE client_integrations
       SET webhook_url = ?, webhook_secret = ?, default_freight_rule = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE client_id = ?`,
      [webhookUrl, webhookSecret, defaultFreightRule, isActive, targetClientId],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
          success: true,
          message: 'Configurações de integração e Webhook salvas com sucesso!'
        });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/regenerate-key - Gerar nova API Key para o cliente
router.post('/regenerate-key', requireFlowAdmin, async (req, res) => {
  try {
    const targetClientId = resolvePanelTargetClientId(req);
    if (!targetClientId) {
      return res.status(400).json({ error: 'Cliente não identificado.' });
    }

    await ensureClientIntegration(targetClientId);
    const newKey = generateApiKey();

    db.run(
      `UPDATE client_integrations SET api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE client_id = ?`,
      [newKey, targetClientId],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
          success: true,
          api_key: newKey,
          message: 'Nova Chave de API (API Key) gerada com sucesso!'
        });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/test-webhook - Testar disparo de Webhook para a URL do cliente
router.post('/test-webhook', requireFlowAdmin, async (req, res) => {
  try {
    const targetClientId = resolvePanelTargetClientId(req);
    if (!targetClientId) {
      return res.status(400).json({ error: 'Cliente não identificado.' });
    }

    const config = await ensureClientIntegration(targetClientId);
    const webhookUrl = (req.body.webhook_url || config.webhook_url || '').trim();

    if (!webhookUrl) {
      return res.status(400).json({ error: 'Informe uma URL de Webhook antes de testar.' });
    }

    const samplePayload = {
      event: 'webhook.test',
      shipment_code: 'ENV-2026-TESTE',
      external_order_id: 'PED-TESTE-001',
      status: 'a_caminho',
      status_label: 'A caminho (Despachado)',
      tracking_code: 'BR987654321BR',
      carrier: 'Correios',
      service: 'SEDEX',
      recipient: {
        name: 'Cliente Teste Integração'
      },
      destination: {
        cep: '88010000',
        city: 'Florianópolis',
        state: 'SC'
      },
      updated_at: new Date().toISOString()
    };

    const payloadStr = JSON.stringify(samplePayload);
    let responseStatus = 0;
    let responseBody = '';
    let logStatus = 'success';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'PersonalizaFlow-Webhook/1.0',
        'X-PersonalizaFlow-Event': 'webhook.test'
      };
      if (config.webhook_secret) {
        headers['X-PersonalizaFlow-Secret'] = config.webhook_secret;
      }

      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: payloadStr,
        signal: controller.signal
      });
      clearTimeout(timer);

      responseStatus = resp.status;
      responseBody = ((await resp.text()) || '').slice(0, 400);
      if (!resp.ok) logStatus = 'error';
    } catch (fetchErr) {
      responseStatus = 0;
      responseBody = fetchErr.message || 'Não foi possível conectar à URL informada.';
      logStatus = 'error';
    }

    db.run(
      `INSERT INTO integration_logs (
        client_id, direction, event_type, external_order_id,
        shipment_id, shipment_code, payload_json, response_status, response_body, status
      ) VALUES (?, 'outbound', 'webhook.test', 'PED-TESTE-001', NULL, 'ENV-2026-TESTE', ?, ?, ?, ?)`,
      [targetClientId, payloadStr, responseStatus, responseBody, logStatus],
      () => {
        res.json({
          success: logStatus === 'success',
          status_code: responseStatus,
          response_body: responseBody,
          message: logStatus === 'success'
            ? `Webhook de teste entregue com sucesso (HTTP ${responseStatus})!`
            : `O servidor de destino não respondeu com sucesso (${responseStatus ? 'HTTP ' + responseStatus : responseBody}). O evento foi registrado no histórico.`
        });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/resend-webhook/:logId - Reenviar atualização de status/rastreio
router.post('/resend-webhook/:logId', requireFlowAdmin, (req, res) => {
  const logId = parseInt(req.params.logId, 10);
  db.get('SELECT * FROM integration_logs WHERE id = ?', [logId], async (err, logRow) => {
    if (err || !logRow) {
      return res.status(404).json({ error: 'Registro de log não encontrado.' });
    }
    if (logRow.shipment_id) {
      const result = await dispatchClientWebhook(logRow.shipment_id, 'shipment.status_updated');
      return res.json({
        success: Boolean(result.sent),
        message: result.sent
          ? `Atualização reenviada com sucesso (HTTP ${result.status_code})!`
          : `Tentativa de reenvio registrada (${result.reason || result.response_body || 'Falha'}).`
      });
    }
    res.status(400).json({ error: 'Este log não possui uma remessa vinculada para reenvio.' });
  });
});

// ============================================================================
// 2. API EXTERNA V1 PARA O SITE DO CLIENTE (EX: BANLEK) & SIMULADOR
// ============================================================================

async function authenticateExternalApi(req) {
  const headerKey =
    req.headers['x-api-key'] ||
    (req.headers['authorization'] && req.headers['authorization'].startsWith('Bearer pflow_')
      ? req.headers['authorization'].replace('Bearer ', '').trim()
      : null) ||
    req.query.api_key ||
    (req.body && req.body.api_key);

  if (headerKey) {
    const configRow = await new Promise((resolve) => {
      db.get(
        `SELECT ci.*, c.name as client_name, c.cnpj_cpf as client_cnpj, c.parent_client_id
         FROM client_integrations ci
         JOIN clients c ON ci.client_id = c.id
         WHERE ci.api_key = ? AND ci.is_active = 1 AND c.status = 'active'`,
        [String(headerKey).trim()],
        (err, row) => resolve(row || null)
      );
    });
    if (configRow) return configRow;
  }

  // Fallback para o Simulador Interno no Painel quando autenticado como Admin
  const panelClientId = resolvePanelTargetClientId(req);
  if (panelClientId && req.isAdmin) {
    await ensureClientIntegration(panelClientId);
    const configRow = await new Promise((resolve) => {
      db.get(
        `SELECT ci.*, c.name as client_name, c.cnpj_cpf as client_cnpj, c.parent_client_id
         FROM client_integrations ci
         JOIN clients c ON ci.client_id = c.id
         WHERE ci.client_id = ?`,
        [panelClientId],
        (err, row) => resolve(row || null)
      );
    });
    if (configRow) return configRow;
  }

  return null;
}

// GET /api/integrations/v1/products - Consultar SKUs e saldo de estoque no Flow
router.get('/v1/products', async (req, res) => {
  const authConfig = await authenticateExternalApi(req);
  if (!authConfig) {
    return res.status(401).json({ error: 'Chave de API (X-API-Key) inválida ou integração inativa.' });
  }

  db.all(
    `SELECT p.code as sku, p.name, p.stock_qty as stock_quantity, p.stock_qty, p.unit_weight, p.unit_height, p.unit_width, p.unit_length,
            pr.max_qty_per_box, pr.box_weight, pr.box_height, pr.box_width, pr.box_length
     FROM products p
     LEFT JOIN packaging_rules pr ON p.id = pr.product_id
     WHERE p.client_id = ?
     ORDER BY p.code ASC`,
    [authConfig.client_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        client: authConfig.client_name,
        products: rows || []
      });
    }
  );
});

// GET /api/integrations/v1/orders/:externalOrderId - Consultar status e rastreio do pedido
router.get('/v1/orders/:externalOrderId', async (req, res) => {
  const authConfig = await authenticateExternalApi(req);
  if (!authConfig) {
    return res.status(401).json({ error: 'Chave de API (X-API-Key) inválida ou integração inativa.' });
  }

  const extId = String(req.params.externalOrderId || '').trim();
  db.get(
    `SELECT * FROM shipments WHERE client_id = ? AND (external_order_id = ? OR code = ?) ORDER BY id DESC LIMIT 1`,
    [authConfig.client_id, extId, extId],
    (err, shipment) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!shipment) {
        return res.status(404).json({ error: `Nenhum pedido/remessa encontrado para "${extId}".` });
      }

      res.json({
        shipment_id: shipment.id,
        shipment_code: shipment.code,
        external_order_id: shipment.external_order_id,
        status: shipment.status,
        status_label: getStatusLabel(shipment.status),
        tracking_code: shipment.tracking_code || null,
        carrier: shipment.selected_carrier,
        service: shipment.selected_service,
        delivery_days: shipment.delivery_days,
        total_volumes: shipment.total_volumes,
        total_weight: shipment.total_weight,
        freight_price: shipment.final_freight_price,
        recipient_name: shipment.recipient_name,
        created_at: shipment.created_at
      });
    }
  );
});

// POST /api/integrations/v1/orders - Receber pedido automatizado do site do cliente (ex: Banlek) via SKU
router.post('/v1/orders', async (req, res) => {
  const authConfig = await authenticateExternalApi(req);
  if (!authConfig) {
    return res.status(401).json({ error: 'Chave de API (X-API-Key) inválida ou integração inativa.' });
  }

  const clientId = authConfig.client_id;
  const body = req.body || {};

  const externalOrderId = String(body.external_order_id || body.order_id || body.order_number || '').trim();
  const recipientObj = body.recipient || {};
  const addressObj = body.address || body.destination || {};

  const recipientName = String(recipientObj.name || body.recipient_name || '').trim();
  const recipientDoc = String(recipientObj.document || recipientObj.cpf_cnpj || body.recipient_document || '').trim();
  const recipientPhone = String(recipientObj.phone || body.recipient_phone || '').trim();
  const recipientEmail = String(recipientObj.email || body.recipient_email || '').trim();

  const rawCep = String(addressObj.cep || addressObj.zip_code || body.dest_cep || body.cep || '').replace(/\D/g, '');
  const street = String(addressObj.street || addressObj.address || body.dest_address || body.address || '').trim();
  const number = String(addressObj.number || body.dest_number || body.number || 'S/N').trim();
  const complement = String(addressObj.complement || body.dest_complement || body.complement || '').trim();
  const neighborhood = String(addressObj.neighborhood || body.dest_neighborhood || body.neighborhood || '').trim();
  const city = String(addressObj.city || body.dest_city || body.city || '').trim();
  const state = String(addressObj.state || addressObj.uf || body.dest_state || body.state || '').trim().toUpperCase();

  const items = Array.isArray(body.items) ? body.items : [];

  const logInboundFailure = (errorMessage, statusCode = 400) => {
    db.run(
      `INSERT INTO integration_logs (
        client_id, direction, event_type, external_order_id,
        shipment_id, shipment_code, payload_json, response_status, response_body, status
      ) VALUES (?, 'inbound', 'order.created', ?, NULL, NULL, ?, ?, ?, 'error')`,
      [clientId, externalOrderId || null, JSON.stringify(body), statusCode, JSON.stringify({ error: errorMessage })]
    );
    return res.status(statusCode).json({ error: errorMessage });
  };

  if (!recipientName || !rawCep || rawCep.length !== 8 || !street || !city || !state) {
    return logInboundFailure('Dados obrigatórios de entrega ausentes: informe recipient.name e address completo (cep com 8 dígitos, street, number, city, state).');
  }

  if (items.length === 0) {
    return logInboundFailure('O pedido deve conter pelo menos 1 item no array "items" com { "sku": "...", "quantity": 1 }.');
  }

  try {
    // Buscar todos os produtos do cliente no Flow
    const clientProducts = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          p.id, p.code, p.name, p.stock_qty as stock_quantity, p.stock_qty, p.unit_weight, p.unit_height, p.unit_width, p.unit_length,
          pr.max_qty_per_box, pr.box_weight, pr.box_height, pr.box_width, pr.box_length
        FROM products p
        LEFT JOIN packaging_rules pr ON p.id = pr.product_id
        WHERE p.client_id = ?
      `;
      db.all(sql, [clientId], (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });

    const resolvedItems = [];
    for (const reqItem of items) {
      const sku = String(reqItem.sku || reqItem.code || '').trim();
      const qty = parseInt(reqItem.quantity || reqItem.qty, 10);

      if (!sku || isNaN(qty) || qty <= 0) {
        return logInboundFailure(`Item inválido no pedido: informe "sku" e "quantity" maior que zero.`);
      }

      const matchedProduct = clientProducts.find(p => String(p.code).trim().toUpperCase() === sku.toUpperCase());
      if (!matchedProduct) {
        return logInboundFailure(`SKU "${sku}" não encontrado no estoque Flow do cliente ${authConfig.client_name}.`);
      }

      if ((matchedProduct.stock_quantity || 0) < qty) {
        return logInboundFailure(`Estoque insuficiente para o SKU "${sku}" (${matchedProduct.name}). Saldo atual no Flow: ${matchedProduct.stock_quantity || 0} un, solicitado: ${qty} un.`);
      }

      resolvedItems.push({
        product: matchedProduct,
        rule: {
          max_qty_per_box: matchedProduct.max_qty_per_box || 1,
          box_weight: matchedProduct.box_weight || 0.2,
          box_height: matchedProduct.box_height || 10,
          box_width: matchedProduct.box_width || 10,
          box_length: matchedProduct.box_length || 10
        },
        quantity: qty
      });
    }

    // 1. Calcular volumes/caixas automaticamente
    const packResult = calculatePackages(resolvedItems);
    const calculatedPackages = packResult.packages || [];
    const totalVolumes = packResult.total_volumes || calculatedPackages.length || 1;
    const totalWeight = packResult.total_weight || 0.3;

    // 2. Cotar frete automaticamente para o CEP do comprador
    const settingsRows = await new Promise((resolve) => {
      db.all("SELECT key, value FROM settings WHERE key IN ('origin_cep', 'default_markup_percent')", (err, r) => resolve(r || []));
    });
    const settingsMap = {};
    settingsRows.forEach(r => { settingsMap[r.key] = r.value; });
    const originCep = settingsMap.origin_cep || '80000000';
    const effectiveMarkup = parseFloat(settingsMap.default_markup_percent) || 10.0;

    let selectedQuote = null;
    try {
      const quotes = await quoteFreight({
        originCep,
        destCep: rawCep,
        packages: calculatedPackages,
        markupPercent: effectiveMarkup,
        onlyMelhorEnvio: true
      });
      if (Array.isArray(quotes) && quotes.length > 0) {
        const rule = body.carrier_preference || authConfig.default_freight_rule || 'cheapest';
        if (rule === 'fastest') {
          selectedQuote = [...quotes].sort((a, b) => (a.delivery_days || 99) - (b.delivery_days || 99))[0];
        } else {
          selectedQuote = [...quotes].sort((a, b) => (a.final_price || 9999) - (b.final_price || 9999))[0];
        }
      }
    } catch (qErr) {
      console.warn('Aviso ao cotar frete na integração:', qErr.message);
    }

    const carrierName = body.carrier_name || (selectedQuote ? selectedQuote.carrier : 'Correios');
    const serviceName = body.service_name || (selectedQuote ? selectedQuote.service : 'PAC / Padrão');
    const baseFreightCost = selectedQuote ? (selectedQuote.cost_price ?? selectedQuote.raw_price ?? 0) : 25.0;
    const finalFreightPrice = selectedQuote ? selectedQuote.final_price : 28.0;
    const deliveryDays = selectedQuote ? selectedQuote.delivery_days : 5;

    const code = `ENV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 3. Gravar remessa em shipments (com status 'em_aberto' e origin_channel 'api_integration')
    const newShipmentId = await new Promise((resolve, reject) => {
      const insertSql = `
        INSERT INTO shipments (
          code, client_id, parent_client_id, billing_client_id, billing_cnpj, billing_name,
          external_order_id, origin_channel,
          recipient_name, recipient_document, recipient_phone, recipient_email,
          dest_cep, dest_address, dest_number, dest_complement, dest_neighborhood, dest_city, dest_state,
          selected_carrier, selected_service, quoted_freight_cost, markup_percent, final_freight_price,
          delivery_days, total_volumes, total_weight, is_manual_override, status, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'api_integration', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'em_aberto', 'em_aberto')
      `;
      db.run(
        insertSql,
        [
          code,
          clientId,
          authConfig.parent_client_id || null,
          clientId,
          authConfig.client_cnpj || '',
          authConfig.client_name || '',
          externalOrderId || null,
          recipientName,
          recipientDoc || null,
          recipientPhone || null,
          recipientEmail || null,
          rawCep,
          street,
          number,
          complement,
          neighborhood,
          city,
          state,
          carrierName,
          serviceName,
          baseFreightCost,
          effectiveMarkup,
          finalFreightPrice,
          deliveryDays,
          totalVolumes,
          totalWeight
        ],
        function (err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });

    // 4. Inserir itens da remessa e descontar estoque no Flow
    for (const item of resolvedItems) {
      db.run(
        `INSERT INTO shipment_items (shipment_id, product_id, quantity) VALUES (?, ?, ?)`,
        [newShipmentId, item.product.id, item.quantity]
      );
      db.run(
        `UPDATE products SET stock_qty = MAX(0, COALESCE(stock_qty, 0) - ?) WHERE id = ?`,
        [item.quantity, item.product.id]
      );
    }

    // 5. Inserir volumes calculados
    calculatedPackages.forEach((p, idx) => {
      db.run(
        `INSERT INTO shipment_packages (shipment_id, volume_number, product_id, weight, height, width, length)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newShipmentId,
          idx + 1,
          p.product_id || null,
          parseFloat(p.weight) || 0.3,
          parseFloat(p.height) || 10,
          parseFloat(p.width) || 10,
          parseFloat(p.length) || 10
        ]
      );
    });

    const responsePayload = {
      success: true,
      message: 'Pedido recebido automaticamente e remessa gerada no Personaliza Flow!',
      shipment: {
        id: newShipmentId,
        shipment_code: code,
        external_order_id: externalOrderId || null,
        status: 'em_aberto',
        status_label: getStatusLabel('em_aberto'),
        carrier: carrierName,
        service: serviceName,
        delivery_days: deliveryDays,
        freight_price: finalFreightPrice,
        total_volumes: totalVolumes,
        total_weight: totalWeight,
        items: resolvedItems.map(i => ({
          sku: i.product.code,
          name: i.product.name,
          quantity: i.quantity
        }))
      }
    };

    // 6. Registrar log de entrada (inbound)
    db.run(
      `INSERT INTO integration_logs (
        client_id, direction, event_type, external_order_id,
        shipment_id, shipment_code, payload_json, response_status, response_body, status
      ) VALUES (?, 'inbound', 'order.created', ?, ?, ?, ?, 201, ?, 'success')`,
      [
        clientId,
        externalOrderId || null,
        newShipmentId,
        code,
        JSON.stringify(body),
        JSON.stringify(responsePayload)
      ]
    );

    // 7. Disparar webhook inicial (shipment.created) se o cliente tiver webhook_url
    dispatchClientWebhook(newShipmentId, 'shipment.created').catch(() => {});

    res.status(201).json(responsePayload);
  } catch (err) {
    console.error('Erro ao criar pedido via API de integração:', err);
    return logInboundFailure('Erro interno ao processar pedido integrado: ' + err.message, 500);
  }
});

module.exports = router;
module.exports.dispatchClientWebhook = dispatchClientWebhook;
