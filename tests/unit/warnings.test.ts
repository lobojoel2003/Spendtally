import { describe, expect, it } from 'vitest';
import { computeLedger } from '../../src/lib/engine';
import { billWarnings, findDuplicates, periodAlerts } from '../../src/lib/warnings';
import { bill, monthly } from './helpers';

const today = '2026-11-19';
const codes = (w: { code: string }[]) => w.map((x) => x.code);

describe('billWarnings', () => {
  it('warns about the one-month rule for unpaid Medicaid-provider bills', () => {
    const b = bill({ status: 'unpaid', medicaidProvider: 'yes' });
    expect(codes(billWarnings(b, { settings: monthly, today }))).toContain(
      'unpaid-medicaid-one-month',
    );
  });

  it('warns about providers that do not take Medicaid', () => {
    const b = bill({ medicaidProvider: 'no' });
    const w = billWarnings(b, { settings: monthly, today });
    expect(codes(w)).toContain('non-medicaid-provider');
    expect(
      codes(billWarnings(bill({ medicaidProvider: 'unknown' }), { settings: monthly, today })),
    ).toContain('unknown-provider');
  });

  it('flags future dates, missing copies, duplicates and paid-in-another-month', () => {
    const a = bill({
      id: 'd1',
      serviceDate: '2026-10-30',
      paidDate: '2026-11-04',
      amountCents: 500,
    });
    const b = bill({ id: 'd2', serviceDate: '2026-10-30', amountCents: 500 });
    const dupes = findDuplicates([a, b]);
    expect(dupes.get('d1')).toEqual(['d2']);
    const w = codes(billWarnings(a, { settings: monthly, today, duplicates: dupes }));
    expect(w).toEqual(expect.arrayContaining(['duplicate', 'no-copy', 'paid-other-month']));
    expect(
      codes(billWarnings(bill({ serviceDate: '2027-01-01' }), { settings: monthly, today })),
    ).toContain('future-date');
  });

  it('respects a state that has no one-month rule', () => {
    const b = bill({ status: 'unpaid', medicaidProvider: 'yes' });
    const rules = {
      spenddownTerm: 'share of cost',
      rules: {
        paidBillsServiceMonthOnly: true,
        unpaidBillsCarryForward: true,
        unpaidMedicaidProviderOneMonth: false,
        premiumsCount: true,
        retroactiveMonths: 3,
      },
    };
    expect(codes(billWarnings(b, { settings: monthly, today, rules }))).not.toContain(
      'unpaid-medicaid-one-month',
    );
  });

  it('explains the spend-down share and what Medicaid may pay', () => {
    const b = bill({
      serviceDate: '2026-11-02',
      amountCents: 80000,
      status: 'unpaid',
      medicaidProvider: 'yes',
    });
    const l = computeLedger({ bills: [b], settings: monthly, today });
    const w = billWarnings(b, { settings: monthly, today, usage: l.usage.get(b.id) });
    expect(codes(w)).toEqual(expect.arrayContaining(['spenddown-portion', 'medicaid-may-pay']));
  });
});

describe('periodAlerts', () => {
  it('reminds about met-but-unsent periods and pay-in', () => {
    const oct = bill({ serviceDate: '2026-10-02', amountCents: 60000 });
    const nov = bill({
      serviceDate: '2026-11-02',
      amountCents: 10000,
      status: 'unpaid',
      medicaidProvider: 'unknown',
    });
    const l = computeLedger({ bills: [oct, nov], settings: monthly, today });
    const alerts = periodAlerts(l, [oct, nov], {
      name: 'New York',
      spenddownTerm: 'spenddown',
      submission: { methods: ['fax'], payIn: true, description: 'x' },
    });
    const ids = alerts.map((a) => a.id);
    expect(ids).toContain('unsent-2026-10');
    expect(ids).toContain('unknown-providers');
    expect(ids).toContain('pay-in');
  });

  it('celebrates a met current period', () => {
    const b = bill({
      serviceDate: '2026-11-02',
      amountCents: 50000,
      status: 'unpaid',
      medicaidProvider: 'yes',
    });
    const l = computeLedger({
      bills: [b],
      settings: { ...monthly, periodAnchor: '2026-11' },
      today,
    });
    const ids = periodAlerts(l, [b], null).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['current-met', 'one-month']));
  });
});

describe('billWarnings — paid-when-paid states', () => {
  it('explains that the bill counts in the payment month', () => {
    const b = bill({ serviceDate: '2026-10-20', paidDate: '2026-11-02' });
    const rules = {
      name: 'California',
      spenddownTerm: 'share of cost',
      rules: {
        paidBillsServiceMonthOnly: false,
        unpaidBillsCarryForward: true,
        unpaidMedicaidProviderOneMonth: null,
        premiumsCount: true,
        retroactiveMonths: 3,
      },
    };
    const w = billWarnings(b, { settings: monthly, today, rules }).find(
      (x) => x.code === 'paid-other-month',
    );
    expect(w?.title).toBe('Counts for November 2026');
    expect(w?.detail).toMatch(/California counts paid bills in the month you paid/);
  });
});
