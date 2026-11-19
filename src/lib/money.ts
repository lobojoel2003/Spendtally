const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const wholeFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** Formats integer cents as US dollars, e.g. `123456` → `$1,234.56`. */
export function formatCents(cents: number, opts: { whole?: boolean } = {}): string {
  const value = (Number.isFinite(cents) ? cents : 0) / 100;
  if (opts.whole && Number.isInteger(value)) return wholeFormatter.format(value);
  return formatter.format(value);
}

/**
 * Parses a user- or OCR-supplied money string into integer cents.
 * Accepts `$1,234.56`, `1234.5`, `1.234,56` (European), `(12.00)` and `12-` (negative).
 * Returns `null` when the string holds no amount.
 */
export function parseMoney(input: string): number | null {
  if (!input) return null;
  let s = input.trim().replace(/\s+/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(s) || /-$/.test(s) || /^-/.test(s)) negative = true;
  s = s.replace(/[^\d.,]/g, '');
  if (!s || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever separator comes last is the decimal separator.
    normalized = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    normalized =
      decimals === 2 && s.indexOf(',') === lastComma ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0 && s.indexOf('.') !== lastDot) {
    // 1.234.567 → thousands separators
    normalized = s.replace(/\./g, '');
  } else {
    normalized = s;
  }
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** Cents → plain editable string, e.g. `12345` → `123.45`. */
export function centsToInput(cents: number): string {
  if (!cents) return '';
  return (cents / 100).toFixed(2);
}
