import type { Bill } from '../../src/lib/types';

let n = 0;
export function bill(partial: Partial<Bill>): Bill {
  n++;
  return {
    id: partial.id ?? `b${n}`,
    provider: 'Test Provider',
    serviceDate: '2026-11-05',
    amountCents: 10000,
    status: 'paid',
    medicaidProvider: 'yes',
    category: 'doctor',
    notes: '',
    attachmentIds: [],
    createdAt: `2026-11-01T00:00:${String(n % 60).padStart(2, '0')}.000Z`,
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...partial,
  };
}

export const monthly = {
  spenddownCents: 50000,
  amountBasis: 'month' as const,
  periodMonths: 1,
  periodAnchor: '2026-09',
};
