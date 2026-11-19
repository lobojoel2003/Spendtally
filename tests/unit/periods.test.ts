import { describe, expect, it } from 'vitest';
import { periodFor, periodLabel, periodTargetCents, periodsBetween } from '../../src/lib/periods';

describe('periods', () => {
  it('tiles monthly periods', () => {
    const p = periodFor('2026-11', '2026-01', 1);
    expect(p.start).toBe('2026-11');
    expect(p.end).toBe('2026-11');
    expect(periodLabel(p)).toBe('November 2026');
  });

  it('tiles six-month periods forward and backward from the anchor', () => {
    expect(periodFor('2026-11', '2026-07', 6).start).toBe('2026-07');
    expect(periodFor('2027-01', '2026-07', 6).start).toBe('2027-01');
    expect(periodFor('2026-06', '2026-07', 6).start).toBe('2026-01');
    expect(periodFor('2026-06', '2026-07', 6).end).toBe('2026-06');
  });

  it('labels multi-month periods', () => {
    expect(periodLabel(periodFor('2026-08', '2026-07', 6))).toBe('Jul – Dec 2026');
    expect(periodLabel(periodFor('2026-11', '2026-10', 3))).toBe('Oct – Dec 2026');
    expect(periodLabel(periodFor('2027-01', '2026-12', 3))).toBe('Dec 2026 – Feb 2027');
  });

  it('lists periods between two months', () => {
    const list = periodsBetween('2026-01', '2026-12', '2026-01', 3);
    expect(list.map((p) => p.key)).toEqual(['2026-01', '2026-04', '2026-07', '2026-10']);
  });

  it('computes the period target', () => {
    expect(
      periodTargetCents({ spenddownCents: 50000, amountBasis: 'month', periodMonths: 6 }),
    ).toBe(300000);
    expect(
      periodTargetCents({ spenddownCents: 300000, amountBasis: 'period', periodMonths: 6 }),
    ).toBe(300000);
    expect(periodTargetCents({ spenddownCents: -5, amountBasis: 'month', periodMonths: 1 })).toBe(
      0,
    );
  });
});
