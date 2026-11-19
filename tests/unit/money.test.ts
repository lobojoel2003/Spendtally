import { describe, expect, it } from 'vitest';
import { centsToInput, formatCents, parseMoney } from '../../src/lib/money';

describe('parseMoney', () => {
  it.each([
    ['$1,234.56', 123456],
    ['1234.5', 123450],
    ['12', 1200],
    ['$ 87.10', 8710],
    ['1.234,56', 123456],
    ['12,50', 1250],
    ['1,234', 123400],
    ['(45.00)', -4500],
    ['45.00-', -4500],
    ['1.234.567', 123456700],
  ])('%s → %i', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it('returns null for text without digits', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('$')).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats dollars', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(50000, { whole: true })).toBe('$500');
    expect(formatCents(50050, { whole: true })).toBe('$500.50');
    expect(formatCents(Number.NaN)).toBe('$0.00');
  });

  it('round-trips through the input format', () => {
    expect(centsToInput(12345)).toBe('123.45');
    expect(centsToInput(0)).toBe('');
  });
});
