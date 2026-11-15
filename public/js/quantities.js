// Integer arithmetic keeps decimal input exact; output rounds once to three decimal places.
export function scaleQuantity(quantity, base, target, language = 'sl') {
  if (quantity === null || quantity === '') return '';
  if (!/^\d+(\.\d+)?$/.test(String(quantity)) || !Number.isInteger(base) || base < 1 || !Number.isInteger(target) || target < 1 || target > 100) throw new Error('Invalid quantity or servings');
  const [whole, fraction = ''] = String(quantity).split('.');
  const numerator = BigInt(whole + fraction) * BigInt(target) * 1000n;
  const denominator = 10n ** BigInt(fraction.length) * BigInt(base);
  const scaled = (numerator + denominator / 2n) / denominator;
  return `${scaled / 1000n}${scaled % 1000n ? '.' + String(scaled % 1000n).padStart(3, '0').replace(/0+$/, '') : ''}`.replace('.', language === 'en' ? '.' : ',');
}
