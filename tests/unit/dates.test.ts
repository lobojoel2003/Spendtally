import { describe, expect, it } from 'vitest';
import {
  addMonths,
  formatDate,
  formatDateUS,
  isValidISODate,
  isValidMonthKey,
  lastDayOfMonth,
  monthKeyOf,
  monthName,
} from '../../src/lib/dates';

describe('dates', () => {
  it('adds months across years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-06', 0)).toBe('2026-06');
  });

  it('validates dates', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2026-2-3')).toBe(false);
    expect(isValidMonthKey('2026-12')).toBe(true);
    expect(isValidMonthKey('2026-13')).toBe(false);
  });

  it('formats dates', () => {
    expect(formatDate('2026-11-05')).toBe('Nov 5, 2026');
    expect(formatDate('2026-11-05', 'long')).toBe('November 5, 2026');
    expect(formatDate('nope')).toBe('—');
    expect(formatDateUS('2026-11-05')).toBe('11/05/2026');
    expect(monthName('2026-11')).toBe('November 2026');
    expect(monthKeyOf('2026-11-05')).toBe('2026-11');
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
  });
});
