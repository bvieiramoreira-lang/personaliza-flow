/**
 * Serviço de Cotação de Fretes Exclusivo Melhor Envio + Margem Personaliza (%)
 */

const axios = require('axios');
const db = require('../database');

function getStoredMelhorEnvioConfig() {
  return new Promise((resolve) => {
    db.all(
      `SELECT key, value FROM settings WHERE key IN ('melhor_envio_token', 'melhor_envio_env', 'origin_cep', 'default_markup_percent')`,
      [],
      (err, rows) => {
        const map = {};
        if (!err && Array.isArray(rows)) {
          rows.forEach(r => { map[r.key] = r.value; });
        }
        resolve({
          token: (map.melhor_envio_token || process.env.MELHOR_ENVIO_TOKEN || '').trim(),
          env: (map.melhor_envio_env || process.env.MELHOR_ENVIO_ENV || 'production').trim(),
          originCep: (map.origin_cep || process.env.ORIGIN_CEP || '88133700').replace(/\D/g, ''),
          defaultMarkup: parseFloat(map.default_markup_percent ?? process.env.DEFAULT_MARKUP_PERCENT ?? 10)
        });
      }
    );
  });
}

async function quoteFreight({ originCep, destCep, packages, markupPercent }) {
  const stored = await getStoredMelhorEnvioConfig();

  const cleanOrigin = (originCep || stored.originCep || '88133700').replace(/\D/g, '');
  const cleanDest = (destCep || '').replace(/\D/g, '');
  const effectiveMarkup = markupPercent !== undefined && markupPercent !== null && !isNaN(parseFloat(markupPercent))
    ? parseFloat(markupPercent)
    : (isNaN(stored.defaultMarkup) ? 10 : stored.defaultMarkup);

  if (!cleanDest || cleanDest.length < 8) {
    throw new Error('CEP de destino inválido.');
  }

  const safePackages = Array.isArray(packages) && packages.length > 0
    ? packages
    : [{ weight: 0.5, height: 15, width: 15, length: 20 }];

  let rawQuotes = [];
  let quoteSource = 'melhor_envio_api';

  const melhorEnvioToken = stored.token;
  if (melhorEnvioToken && melhorEnvioToken !== 'your_melhor_envio_token_here') {
    try {
      rawQuotes = await quoteMelhorEnvio({
        originCep: cleanOrigin,
        destCep: cleanDest,
        packages: safePackages,
        token: melhorEnvioToken,
        env: stored.env
      });
    } catch (err) {
      console.warn('Aviso ao cotar na API do Melhor Envio, utilizando cálculo contingencial:', err.message);
      quoteSource = 'fallback_simulator';
      rawQuotes = generateMockQuotes({ originCep: cleanOrigin, destCep: cleanDest, packages: safePackages });
    }
  } else {
    quoteSource = 'fallback_simulator';
    rawQuotes = generateMockQuotes({ originCep: cleanOrigin, destCep: cleanDest, packages: safePackages });
  }

  // Aplicar a porcentagem configurada em Parâmetros & Frete sobre o valor da Melhor Envio
  const markupMultiplier = 1 + (effectiveMarkup / 100);

  const finalQuotes = rawQuotes.map(quote => {
    const rawPrice = parseFloat(quote.price);
    const finalPrice = parseFloat((rawPrice * markupMultiplier).toFixed(2));
    const markupValue = parseFloat((finalPrice - rawPrice).toFixed(2));

    return {
      carrier: quote.carrier,
      service: quote.service,
      company_logo: quote.company_logo || null,
      raw_price: rawPrice,
      cost_price: rawPrice,
      base_cost: rawPrice,
      markup_percent: effectiveMarkup,
      markup_value: markupValue,
      final_price: finalPrice,
      delivery_days: quote.delivery_days,
      source: quoteSource
    };
  });

  // Ordenar por menor preço final
  finalQuotes.sort((a, b) => a.final_price - b.final_price);

  return finalQuotes;
}

// Contingência caso o servidor esteja sem internet no momento
function generateMockQuotes({ packages }) {
  const totalWeight = packages.reduce((sum, p) => sum + (parseFloat(p.weight) || 0.3), 0);
  const totalCubicVolume = packages.reduce((sum, p) => sum + ((p.height || 10) * (p.width || 10) * (p.length || 10) / 1000000), 0);

  const cubicWeight = totalCubicVolume * 167;
  const taxableWeight = Math.max(totalWeight, cubicWeight);
  const baseTariff = 15.0 + (taxableWeight * 3.50);

  return [
    {
      carrier: 'Correios (Melhor Envio)',
      service: 'PAC',
      price: parseFloat((baseTariff * 0.85).toFixed(2)),
      delivery_days: 6
    },
    {
      carrier: 'Jadlog (Melhor Envio)',
      service: '.Package',
      price: parseFloat((baseTariff * 0.95).toFixed(2)),
      delivery_days: 4
    },
    {
      carrier: 'Correios (Melhor Envio)',
      service: 'SEDEX',
      price: parseFloat((baseTariff * 1.40).toFixed(2)),
      delivery_days: 2
    },
    {
      carrier: 'Loggi (Melhor Envio)',
      service: 'Express',
      price: parseFloat((baseTariff * 1.18).toFixed(2)),
      delivery_days: 3
    }
  ];
}

// Cotação oficial na API v2 do Melhor Envio
async function quoteMelhorEnvio({ originCep, destCep, packages, token, env = 'production' }) {
  const volumesPayload = packages.map(p => ({
    height: Math.max(2, Math.round(parseFloat(p.height) || 10)),
    width: Math.max(11, Math.round(parseFloat(p.width) || 12)),
    length: Math.max(16, Math.round(parseFloat(p.length) || 16)),
    weight: Math.max(0.1, parseFloat(p.weight) || 0.3),
    insurance_value: 0,
    quantity: 1
  }));

  const isSandbox = env === 'sandbox';
  const url = isSandbox
    ? 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate'
    : 'https://melhorenvio.com.br/api/v2/me/shipment/calculate';

  const response = await axios.post(
    url,
    {
      from: { postal_code: originCep },
      to: { postal_code: destCep },
      volumes: volumesPayload
    },
    {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'PersonalizaFlow (admpersonaliza1@gmail.com)'
      },
      timeout: 10000
    }
  );

  const list = Array.isArray(response.data) ? response.data : [];
  return list
    .filter(item => !item.error && item.price)
    .map(item => ({
      carrier: item.company ? item.company.name : item.name,
      service: item.name,
      company_logo: item.company ? item.company.picture : null,
      price: parseFloat(item.custom_price || item.price),
      delivery_days: parseInt(item.custom_delivery_time || item.delivery_time, 10) || 5
    }));
}

module.exports = {
  quoteFreight,
  getStoredMelhorEnvioConfig
};
