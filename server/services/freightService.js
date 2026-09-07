/**
 * Serviço de Cotação de Fretes com aplicação de Margem Personaliza
 * Suporta Integração Real (Melhor Envio / Frenet) e Fallback Simulador
 */

const axios = require('axios');
const disktenhaService = require('./disktenhaService');

async function quoteFreight({ originCep, destCep, packages, markupPercent = 10 }) {
  // Limpar CEPs
  const cleanOrigin = (originCep || '80000000').replace(/\D/g, '');
  const cleanDest = (destCep || '').replace(/\D/g, '');

  if (!cleanDest || cleanDest.length < 8) {
    throw new Error('CEP de destino inválido.');
  }

  // Tentar cotação na API real se token estiver configurado, caso contrário usar simulador de alta precisão
  let rawQuotes = [];

  const melhorEnvioToken = process.env.MELHOR_ENVIO_TOKEN;
  if (melhorEnvioToken && melhorEnvioToken !== 'your_melhor_envio_token_here') {
    try {
      rawQuotes = await quoteMelhorEnvio({ originCep: cleanOrigin, destCep: cleanDest, packages, token: melhorEnvioToken });
    } catch (err) {
      console.warn('Erro ao cotar no Melhor Envio, utilizando simulador:', err.message);
      rawQuotes = generateMockQuotes({ originCep: cleanOrigin, destCep: cleanDest, packages });
    }
  } else {
    // Simulador realista baseado na cubagem e peso das embalagens
    rawQuotes = generateMockQuotes({ originCep: cleanOrigin, destCep: cleanDest, packages });
  }

  // Consultar transportadora regional Disktenha via tabela Excel
  const disktenhaQuote = disktenhaService.getQuoteForCep(cleanDest);
  if (disktenhaQuote) {
    rawQuotes.push(disktenhaQuote);
  }

  // Aplicar margem de lucro da Personaliza em cada opção de frete
  const markupMultiplier = 1 + (parseFloat(markupPercent) / 100);

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
      markup_percent: parseFloat(markupPercent),
      markup_value: markupValue,
      final_price: finalPrice,
      delivery_days: quote.delivery_days,
      city: quote.city || null,
      is_table: quote.is_table || false
    };
  });

  // Ordenar por menor preço final
  finalQuotes.sort((a, b) => a.final_price - b.final_price);

  return finalQuotes;
}

// Simulador Logístico Realista para testes e fallback
function generateMockQuotes({ originCep, destCep, packages }) {
  const totalWeight = packages.reduce((sum, p) => sum + p.weight, 0);
  const totalCubicVolume = packages.reduce((sum, p) => sum + (p.height * p.width * p.length / 1000000), 0);

  // Fator de cubagem padrão (167 kg/m³)
  const cubicWeight = totalCubicVolume * 167;
  const taxableWeight = Math.max(totalWeight, cubicWeight);

  const baseTariff = 15.0 + (taxableWeight * 3.50);

  return [
    {
      carrier: 'Jadlog',
      service: 'Package Standard',
      price: parseFloat((baseTariff * 0.95).toFixed(2)),
      delivery_days: 4
    },
    {
      carrier: 'Correios',
      service: 'SEDEX Express',
      price: parseFloat((baseTariff * 1.40).toFixed(2)),
      delivery_days: 2
    },
    {
      carrier: 'Correios',
      service: 'PAC Convencional',
      price: parseFloat((baseTariff * 0.85).toFixed(2)),
      delivery_days: 6
    },
    {
      carrier: 'Loggi',
      service: 'Direto Express',
      price: parseFloat((baseTariff * 1.20).toFixed(2)),
      delivery_days: 3
    }
  ];
}

// Suporte ao Melhor Envio
async function quoteMelhorEnvio({ originCep, destCep, packages, token }) {
  const volumesPayload = packages.map(p => ({
    height: Math.max(1, Math.round(p.height)),
    width: Math.max(1, Math.round(p.width)),
    length: Math.max(1, Math.round(p.length)),
    weight: Math.max(0.1, p.weight),
    insurance_value: 0,
    quantity: 1
  }));

  const isProduction = process.env.MELHOR_ENVIO_ENV === 'production' || process.env.NODE_ENV === 'production';
  const url = isProduction 
    ? 'https://melhorenvio.com.br/api/v2/me/shipment/calculate' 
    : 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate';

  const response = await axios.post(url, {
    from: { postal_code: originCep },
    to: { postal_code: destCep },
    volumes: volumesPayload
  }, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'PersonalizaFlow (admpersonaliza1@gmail.com)'
    }
  });

  return response.data
    .filter(item => !item.error && item.price)
    .map(item => ({
      carrier: item.company ? item.company.name : item.name,
      service: item.name,
      company_logo: item.company ? item.company.picture : null,
      price: parseFloat(item.price),
      delivery_days: item.custom_delivery_time || item.delivery_time
    }));
}

module.exports = {
  quoteFreight
};
