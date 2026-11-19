import { describe, expect, it } from 'vitest';
import { computeLedger, progressOf } from '../../src/lib/engine';
import type { Submission } from '../../src/lib/types';
import { bill, monthly } from './helpers';

const today = '2026-11-19';

describe('computeLedger — paid bills', () => {
  it('counts paid bills in the month of service and meets the spend-down', () => {
    const a = bill({ serviceDate: '2026-11-02', amountCents: 30000 });
    const b = bill({ serviceDate: '2026-11-10', amountCents: 25000 });
    const l = computeLedger({ bills: [a, b], settings: monthly, today });
    expect(l.current.period.key).toBe('2026-11');
    expect(l.current.appliedCents).toBe(50000);
    expect(l.current.met).toBe(true);
    expect(l.current.remainingCents).toBe(0);
    expect(l.current.excessPaidCents).toBe(5000);
    expect(progressOf(l.current)).toBe(1);
  });

  it('never carries a paid bill into another month', () => {
    const oct = bill({ serviceDate: '2026-10-28', amountCents: 90000, paidDate: '2026-11-03' });
    const l = computeLedger({ bills: [oct], settings: monthly, today });
    expect(l.byKey.get('2026-10')?.appliedCents).toBe(50000);
    expect(l.current.appliedCents).toBe(0);
    expect(l.usage.get(oct.id)?.closedReason).toBe('paid-period-ended');
  });

  it('ignores paid bills from before the first period', () => {
    const old = bill({ serviceDate: '2026-06-01', amountCents: 90000 });
    const l = computeLedger({ bills: [old], settings: monthly, today });
    expect(l.periods[0]?.period.key).toBe('2026-09');
    expect(l.periods.every((p) => p.appliedCents === 0)).toBe(true);
    expect(l.usage.get(old.id)?.closedReason).toBe('before-first-period');
  });
});

describe('computeLedger — unpaid bills', () => {
  it('carries an unpaid bill from a non-Medicaid provider across months', () => {
    const big = bill({
      serviceDate: '2026-09-04',
      amountCents: 120000,
      status: 'unpaid',
      medicaidProvider: 'no',
    });
    const l = computeLedger({ bills: [big], settings: monthly, today });
    expect(l.byKey.get('2026-09')?.appliedCents).toBe(50000);
    expect(l.byKey.get('2026-10')?.appliedCents).toBe(50000);
    expect(l.byKey.get('2026-10')?.entries[0]?.source).toBe('carried');
    expect(l.current.appliedCents).toBe(20000);
    expect(l.current.carriedInCents).toBe(20000);
    expect(l.usage.get(big.id)?.availableCents).toBe(0);
    expect(l.usage.get(big.id)?.appliedCents).toBe(120000);
  });

  it('uses an unpaid Medicaid-provider bill for one month only (Medicaid pays the rest)', () => {
    const b = bill({
      serviceDate: '2026-09-04',
      amountCents: 120000,
      status: 'unpaid',
      medicaidProvider: 'yes',
    });
    const l = computeLedger({ bills: [b], settings: monthly, today });
    const sep = l.byKey.get('2026-09');
    expect(sep?.met).toBe(true);
    expect(sep?.covered).toEqual([{ billId: b.id, cents: 70000 }]);
    expect(l.byKey.get('2026-10')?.appliedCents).toBe(0);
    const u = l.usage.get(b.id);
    expect(u?.medicaidMayPayCents).toBe(70000);
    expect(u?.closedReason).toBe('medicaid-paid');
  });

  it('keeps an unpaid Medicaid-provider bill available while the month is not met', () => {
    const b = bill({
      serviceDate: '2026-09-04',
      amountCents: 30000,
      status: 'unpaid',
      medicaidProvider: 'yes',
    });
    const c = bill({ serviceDate: '2026-10-04', amountCents: 25000, status: 'paid' });
    const l = computeLedger({ bills: [b, c], settings: monthly, today });
    expect(l.byKey.get('2026-09')?.met).toBe(false);
    // September's bill was fully used in September, so nothing carries.
    expect(l.byKey.get('2026-10')?.appliedCents).toBe(25000);
  });

  it('applies the one-month rule to old unpaid Medicaid-provider bills', () => {
    const old = bill({
      serviceDate: '2026-05-10',
      amountCents: 200000,
      status: 'unpaid',
      medicaidProvider: 'yes',
    });
    const l = computeLedger({ bills: [old], settings: monthly, today });
    expect(l.byKey.get('2026-09')?.appliedCents).toBe(50000);
    expect(l.byKey.get('2026-09')?.entries[0]?.source).toBe('carried');
    expect(l.byKey.get('2026-10')?.appliedCents).toBe(0);
    expect(l.usage.get(old.id)?.closedReason).toBe('one-month-rule');
  });

  it('lets old unpaid non-Medicaid bills keep counting when the state allows carry-forward', () => {
    const old = bill({
      serviceDate: '2026-05-10',
      amountCents: 200000,
      status: 'unpaid',
      medicaidProvider: 'no',
    });
    const l = computeLedger({ bills: [old], settings: monthly, today });
    expect(l.byKey.get('2026-09')?.appliedCents).toBe(50000);
    expect(l.byKey.get('2026-10')?.appliedCents).toBe(50000);
    expect(l.current.appliedCents).toBe(50000);
  });

  it('does not carry unpaid bills when the state says no', () => {
    const big = bill({
      serviceDate: '2026-09-04',
      amountCents: 120000,
      status: 'unpaid',
      medicaidProvider: 'no',
    });
    const rules = {
      rules: {
        paidBillsServiceMonthOnly: true,
        unpaidBillsCarryForward: false,
        unpaidMedicaidProviderOneMonth: null,
        premiumsCount: true,
        retroactiveMonths: 3,
      },
    };
    const l = computeLedger({ bills: [big], settings: monthly, rules, today });
    expect(l.byKey.get('2026-09')?.appliedCents).toBe(50000);
    expect(l.byKey.get('2026-10')?.appliedCents).toBe(0);
  });

  it('marks unneeded Medicaid-provider bills in a met month as likely covered', () => {
    const paid = bill({ serviceDate: '2026-11-01', amountCents: 60000 });
    const later = bill({
      serviceDate: '2026-11-12',
      amountCents: 40000,
      status: 'unpaid',
      medicaidProvider: 'yes',
    });
    const l = computeLedger({ bills: [paid, later], settings: monthly, today });
    expect(l.current.entries.map((e) => e.billId)).toEqual([paid.id]);
    expect(l.current.covered).toEqual([{ billId: later.id, cents: 40000 }]);
  });
});

describe('computeLedger — ordering, periods and submissions', () => {
  it('uses paid bills, then unpaid non-Medicaid, then carried, then Medicaid-provider bills', () => {
    const carried = bill({
      id: 'carried',
      serviceDate: '2026-10-01',
      amountCents: 80000,
      status: 'unpaid',
      medicaidProvider: 'no',
    });
    const med = bill({
      id: 'med',
      serviceDate: '2026-11-01',
      amountCents: 10000,
      status: 'unpaid',
      medicaidProvider: 'yes',
    });
    const other = bill({
      id: 'other',
      serviceDate: '2026-11-03',
      amountCents: 10000,
      status: 'unpaid',
      medicaidProvider: 'no',
    });
    const paid = bill({
      id: 'paid',
      serviceDate: '2026-11-09',
      amountCents: 10000,
      status: 'paid',
    });
    const l = computeLedger({
      bills: [carried, med, other, paid],
      settings: { ...monthly, periodAnchor: '2026-10' },
      today,
    });
    expect(l.byKey.get('2026-10')?.appliedCents).toBe(50000);
    expect(l.current.entries.map((e) => [e.billId, e.cents])).toEqual([
      ['paid', 10000],
      ['other', 10000],
      ['carried', 30000],
    ]);
    expect(l.current.covered).toEqual([{ billId: 'med', cents: 10000 }]);
  });

  it('uses a six-month period target', () => {
    const b = bill({ serviceDate: '2026-08-01', amountCents: 100000 });
    const c = bill({ serviceDate: '2026-11-01', amountCents: 250000 });
    const l = computeLedger({
      bills: [b, c],
      settings: {
        spenddownCents: 50000,
        amountBasis: 'month',
        periodMonths: 6,
        periodAnchor: '2026-07',
      },
      today,
    });
    expect(l.targetCents).toBe(300000);
    expect(l.current.period.key).toBe('2026-07');
    expect(l.current.appliedCents).toBe(300000);
    expect(l.current.met).toBe(true);
  });

  it('locks bills to the period they were submitted for', () => {
    const big = bill({
      id: 'big',
      serviceDate: '2026-10-02',
      amountCents: 100000,
      status: 'unpaid',
      medicaidProvider: 'no',
    });
    const sub: Submission = {
      id: 's1',
      periodKey: '2026-10',
      createdAt: '2026-10-20T00:00:00Z',
      applied: { big: 70000 },
      billIds: ['big'],
      totalCents: 100000,
      method: 'fax',
    };
    const l = computeLedger({
      bills: [big],
      settings: { ...monthly, periodAnchor: '2026-10' },
      submissions: [sub],
      today,
    });
    const oct = l.byKey.get('2026-10');
    expect(oct?.appliedCents).toBe(70000);
    expect(oct?.entries[0]?.source).toBe('submitted');
    expect(oct?.submissions).toHaveLength(1);
    expect(l.current.appliedCents).toBe(30000);
    expect(l.usage.get('big')?.submittedIn).toEqual(['2026-10']);
  });

  it('ignores bills without a date or amount', () => {
    const l = computeLedger({
      bills: [bill({ serviceDate: '', amountCents: 5000 }), bill({ amountCents: 0 })],
      settings: monthly,
      today,
    });
    expect(l.current.appliedCents).toBe(0);
    expect(l.usage.size).toBe(0);
  });

  it('returns an empty current period when there are no bills', () => {
    const l = computeLedger({
      bills: [],
      settings: { ...monthly, periodAnchor: '2026-11' },
      today,
    });
    expect(l.current.period.key).toBe('2026-11');
    expect(l.current.remainingCents).toBe(50000);
    expect(progressOf(l.current)).toBe(0);
    expect(progressOf({ appliedCents: 0, targetCents: 0 })).toBe(0);
  });

  it('includes future-dated bills in later periods without touching the current one', () => {
    const f = bill({ serviceDate: '2027-01-15', amountCents: 50000 });
    const l = computeLedger({ bills: [f], settings: monthly, today });
    expect(l.current.appliedCents).toBe(0);
    expect(l.byKey.get('2027-01')?.met).toBe(true);
  });
});

describe('computeLedger — states that count paid bills when paid', () => {
  const whenPaid = {
    rules: {
      paidBillsServiceMonthOnly: false,
      unpaidBillsCarryForward: true,
      unpaidMedicaidProviderOneMonth: null,
      premiumsCount: true,
      retroactiveMonths: 3,
    },
  };

  it('counts a paid bill in the month it was paid', () => {
    const b = bill({ serviceDate: '2026-10-20', paidDate: '2026-11-02', amountCents: 50000 });
    const l = computeLedger({ bills: [b], settings: monthly, rules: whenPaid, today });
    expect(l.byKey.get('2026-10')?.appliedCents).toBe(0);
    expect(l.current.appliedCents).toBe(50000);
    expect(l.usage.get(b.id)?.periodKey).toBe('2026-11');
  });

  it('falls back to the service month without a valid paid date', () => {
    const b = bill({ serviceDate: '2026-10-20', paidDate: '2026-10-01', amountCents: 50000 });
    const l = computeLedger({ bills: [b], settings: monthly, rules: whenPaid, today });
    expect(l.byKey.get('2026-10')?.appliedCents).toBe(50000);
  });
});
