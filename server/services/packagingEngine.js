/**
 * Engine Logístico do Personaliza Flow
 * Calcula a quantidade de volumes/caixas reais com base no cadastro do produto + regra de embalagem.
 * 
 * Regra do MVP (Opção A): Cada produto gera seus próprios volumes com base na sua regra de embalagem.
 */

function calculatePackages(cartItemsWithRules) {
  const packages = [];
  let volumeCounter = 1;

  for (const item of cartItemsWithRules) {
    const { product, rule, quantity } = item;

    const unitWeight = parseFloat(product.unit_weight) || 0;
    const maxPerBox = parseInt(rule.max_qty_per_box, 10) || 1;
    const boxTareWeight = parseFloat(rule.box_weight) || 0;
    const boxHeight = parseFloat(rule.box_height) || 10;
    const boxWidth = parseFloat(rule.box_width) || 10;
    const boxLength = parseFloat(rule.box_length) || 10;

    let remainingQty = quantity;

    while (remainingQty > 0) {
      const currentBoxQty = Math.min(remainingQty, maxPerBox);
      const totalBoxWeight = parseFloat((boxTareWeight + (currentBoxQty * unitWeight)).toFixed(3));

      packages.push({
        volume_number: volumeCounter++,
        product_id: product.id,
        product_code: product.code,
        product_name: product.name,
        items_count: currentBoxQty,
        weight: totalBoxWeight,
        height: boxHeight,
        width: boxWidth,
        length: boxLength,
        cubic_volume: parseFloat(((boxHeight * boxWidth * boxLength) / 1000000).toFixed(6)) // m³
      });

      remainingQty -= currentBoxQty;
    }
  }

  const totalWeight = parseFloat(packages.reduce((acc, p) => acc + p.weight, 0).toFixed(3));

  return {
    packages,
    total_volumes: packages.length,
    total_weight: totalWeight
  };
}

module.exports = {
  calculatePackages
};
