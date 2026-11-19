/**
 * The spend-down ledger.
 *
 * Walks every spend-down period in order and estimates which bills count toward each one.
 * The rules it models (see docs/SPEND-DOWN-RULES.md):
 *
 *  - A paid bill counts only in the period that contains its date of service
 *    (or its payment date, in states that count paid bills when paid).
 *  - An unpaid bill that is still owed can carry forward to later periods (if the state allows),
 *    so one big old bill can meet the spend-down for several months.
 *  - Once a period is met, Medicaid pays the rest of that period's bills from Medicaid providers.
 *    So an unpaid bill from a Medicaid provider turns coverage on for one period only.
 *  - The part of a bill used to meet the spend-down is never covered by Medicaid.
 *  - Bills already sent in a packet stay locked to that period and are never double-counted.
 *
 * The result is an estimate. The caseworker makes the final call.
 */
import { compareMonths, monthKeyOf, todayISO } from './dates';
import { periodFor, periodTargetCents, periodsBetween, type Period } from './periods';
import type { Bill, MonthKey, Settings, StateRules, Submission } from './types';

export type EntrySource = 'submitted' | 'paid' | 'unpaid' | 'carried';

export interface LedgerEntry {
  billId: string;
  cents: number;
  source: EntrySource;
}

export interface PeriodResult {
  period: Period;
  targetCents: number;
  appliedCents: number;
  remainingCents: number;
  met: boolean;
  /** Bills sent in a packet for this period. */
  submissions: Submission[];
  entries: LedgerEntry[];
  /** Ids of bills whose date of service falls in this period. */
  billIds: string[];
  /** Unpaid balance carried in from earlier periods (before this period used any). */
  carriedInCents: number;
  /** Medicaid-provider bills from this period that Medicaid may pay once the spend-down is met. */
  covered: { billId: string; cents: number }[];
  /** Paid amounts above the target. They can't carry forward. */
  excessPaidCents: number;
  isCurrent: boolean;
}

export interface BillUsage {
  billId: string;
  /** Period the bill counts in (normally the one containing its date of service). */
  periodKey: MonthKey;
  appliedCents: number;
  perPeriod: { periodKey: MonthKey; cents: number; source: EntrySource }[];
  /** Balance still available to count in a later period. */
  availableCents: number;
  /** Amount Medicaid may pay because the period was met. */
  medicaidMayPayCents: number;
  /** Why this bill can no longer count. */
  closedReason?: 'medicaid-paid' | 'one-month-rule' | 'paid-period-ended' | 'before-first-period';
  submittedIn: MonthKey[];
}

export interface Ledger {
  periods: PeriodResult[];
  byKey: Map<MonthKey, PeriodResult>;
  usage: Map<string, BillUsage>;
  current: PeriodResult;
  targetCents: number;
}

export interface LedgerInput {
  bills: Bill[];
  settings: Pick<Settings, 'spenddownCents' | 'amountBasis' | 'periodMonths' | 'periodAnchor'>;
  rules?: Pick<StateRules, 'rules'> | null;
  submissions?: Submission[];
  today?: string;
}

const CATEGORY_ORDER: Record<string, number> = { premium: 0 };

function byServiceDate(a: Bill, b: Bill): number {
  if (a.serviceDate !== b.serviceDate) return a.serviceDate < b.serviceDate ? -1 : 1;
  const ca = CATEGORY_ORDER[a.category] ?? 1;
  const cb = CATEGORY_ORDER[b.category] ?? 1;
  if (ca !== cb) return ca - cb;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

function countable(bill: Bill): boolean {
  return bill.amountCents > 0 && /^\d{4}-\d{2}-\d{2}$/.test(bill.serviceDate);
}

/**
 * The month a bill counts in. Usually the month of service; in states where paid bills count
 * when they were paid (`paidBillsServiceMonthOnly: false`), a paid bill counts in its payment month.
 */
export function countingMonth(bill: Bill, rules?: Pick<StateRules, 'rules'> | null): MonthKey {
  if (
    bill.status === 'paid' &&
    rules?.rules.paidBillsServiceMonthOnly === false &&
    bill.paidDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(bill.paidDate) &&
    bill.paidDate >= bill.serviceDate
  ) {
    return monthKeyOf(bill.paidDate);
  }
  return monthKeyOf(bill.serviceDate);
}

export function computeLedger(input: LedgerInput): Ledger {
  const { settings } = input;
  const today = input.today ?? todayISO();
  const flags = input.rules?.rules;
  const carryForward = flags?.unpaidBillsCarryForward !== false;
  const oneMonthRule = flags?.unpaidMedicaidProviderOneMonth !== false;
  const length = Math.max(1, settings.periodMonths || 1);
  const anchor = settings.periodAnchor || monthKeyOf(today);
  const targetCents = periodTargetCents(settings);
  const submissions = [...(input.submissions ?? [])].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1,
  );

  const bills = input.bills.filter(countable).sort(byServiceDate);
  const billById = new Map(bills.map((b) => [b.id, b]));
  const monthOf = new Map(bills.map((b) => [b.id, countingMonth(b, input.rules)]));
  const month = (b: Bill): MonthKey => monthOf.get(b.id) ?? monthKeyOf(b.serviceDate);

  const firstPeriod = periodFor(anchor, anchor, length);
  const currentMonth = monthKeyOf(today);
  let lastMonth = currentMonth;
  for (const b of bills) {
    const m = month(b);
    if (compareMonths(m, lastMonth) > 0) lastMonth = m;
  }
  for (const s of submissions) {
    if (compareMonths(s.periodKey, lastMonth) > 0) lastMonth = s.periodKey;
  }
  const startMonth =
    compareMonths(currentMonth, firstPeriod.start) < 0 ? currentMonth : firstPeriod.start;
  const periods = periodsBetween(startMonth, lastMonth, anchor, length);
  const currentKey = periodFor(currentMonth, anchor, length).key;

  // Remaining balance of each bill that can still count somewhere.
  const available = new Map<string, number>();
  const usage = new Map<string, BillUsage>();
  for (const b of bills) {
    available.set(b.id, b.amountCents);
    usage.set(b.id, {
      billId: b.id,
      periodKey: periodFor(month(b), anchor, length).key,
      appliedCents: 0,
      perPeriod: [],
      availableCents: b.amountCents,
      medicaidMayPayCents: 0,
      submittedIn: [],
    });
  }

  // Unpaid bills dated before the first period form the opening carry-over pool.
  const pool: Bill[] = [];
  for (const b of bills) {
    if (compareMonths(month(b), periods[0]?.start ?? anchor) < 0) {
      if (b.status === 'unpaid' && carryForward) pool.push(b);
      else {
        available.set(b.id, 0);
        const u = usage.get(b.id);
        if (u) u.closedReason = 'before-first-period';
      }
    }
  }

  const results: PeriodResult[] = [];

  for (const period of periods) {
    const inPeriod = bills.filter((b) => periodFor(month(b), anchor, length).key === period.key);
    const periodSubs = submissions.filter((s) => s.periodKey === period.key);
    const entries: LedgerEntry[] = [];
    let applied = 0;
    const carriedInCents = pool.reduce((sum, b) => sum + (available.get(b.id) ?? 0), 0);

    const apply = (bill: Bill, source: EntrySource, max?: number) => {
      const left = available.get(bill.id) ?? 0;
      const want = max ?? targetCents - applied;
      const cents = Math.max(0, Math.min(left, want));
      if (cents <= 0) return;
      available.set(bill.id, left - cents);
      applied += cents;
      const existing = entries.find((e) => e.billId === bill.id);
      if (existing) existing.cents += cents;
      else entries.push({ billId: bill.id, cents, source });
    };

    // 1. Bills already sent for this period are locked in, exactly as sent.
    for (const sub of periodSubs) {
      for (const [billId, cents] of Object.entries(sub.applied)) {
        const bill = billById.get(billId);
        if (!bill) continue;
        apply(bill, 'submitted', cents);
        usage.get(billId)?.submittedIn.push(period.key);
      }
    }

    // 2. Estimate the rest, in the order that preserves the most value for the person:
    //    paid bills first (they expire with the period), then unpaid bills Medicaid won't pay,
    //    then older unpaid balances, and Medicaid-provider bills last (Medicaid pays them once met).
    const paid = inPeriod.filter((b) => b.status === 'paid');
    const unpaidOther = inPeriod.filter(
      (b) => b.status === 'unpaid' && b.medicaidProvider !== 'yes',
    );
    const unpaidMedicaid = inPeriod.filter(
      (b) => b.status === 'unpaid' && b.medicaidProvider === 'yes',
    );
    const order: [Bill, EntrySource][] = [
      ...paid.map((b): [Bill, EntrySource] => [b, 'paid']),
      ...unpaidOther.map((b): [Bill, EntrySource] => [b, 'unpaid']),
      ...pool.map((b): [Bill, EntrySource] => [b, 'carried']),
      ...unpaidMedicaid.map((b): [Bill, EntrySource] => [b, 'unpaid']),
    ];
    for (const [bill, source] of order) {
      if (applied >= targetCents) break;
      apply(bill, source);
    }

    const met = targetCents > 0 && applied >= targetCents;
    const covered: { billId: string; cents: number }[] = [];
    let excessPaidCents = 0;

    // 3. Settle what is left of each bill once the period closes.
    for (const b of paid) {
      excessPaidCents += available.get(b.id) ?? 0;
      available.set(b.id, 0);
      const u = usage.get(b.id);
      if (u && !u.closedReason) u.closedReason = 'paid-period-ended';
    }
    for (const b of [...unpaidOther, ...unpaidMedicaid]) {
      const left = available.get(b.id) ?? 0;
      const u = usage.get(b.id);
      if (met && b.medicaidProvider === 'yes') {
        if (left > 0) covered.push({ billId: b.id, cents: left });
        if (u) {
          u.medicaidMayPayCents = left;
          u.closedReason = 'medicaid-paid';
        }
        available.set(b.id, 0);
      } else if (carryForward && left > 0) {
        pool.push(b);
      } else {
        available.set(b.id, 0);
      }
    }
    // Older unpaid bills from Medicaid providers can switch coverage on only once.
    for (const b of [...pool]) {
      const usedHere = entries.some((e) => e.billId === b.id);
      if (
        met &&
        usedHere &&
        b.medicaidProvider === 'yes' &&
        oneMonthRule &&
        !inPeriod.includes(b)
      ) {
        available.set(b.id, 0);
        const u = usage.get(b.id);
        if (u) u.closedReason = 'one-month-rule';
      }
    }
    for (let i = pool.length - 1; i >= 0; i--) {
      const b = pool[i];
      if (b && (available.get(b.id) ?? 0) <= 0) pool.splice(i, 1);
    }

    for (const e of entries) {
      const u = usage.get(e.billId);
      if (!u) continue;
      u.appliedCents += e.cents;
      u.perPeriod.push({ periodKey: period.key, cents: e.cents, source: e.source });
    }

    results.push({
      period,
      targetCents,
      appliedCents: applied,
      remainingCents: Math.max(0, targetCents - applied),
      met,
      submissions: periodSubs,
      entries,
      billIds: inPeriod.map((b) => b.id),
      carriedInCents,
      covered,
      excessPaidCents,
      isCurrent: period.key === currentKey,
    });
  }

  for (const u of usage.values()) u.availableCents = available.get(u.billId) ?? 0;

  const byKey = new Map(results.map((r) => [r.period.key, r]));
  const current =
    byKey.get(currentKey) ??
    ({
      period: periodFor(currentMonth, anchor, length),
      targetCents,
      appliedCents: 0,
      remainingCents: targetCents,
      met: false,
      submissions: [],
      entries: [],
      billIds: [],
      carriedInCents: 0,
      covered: [],
      excessPaidCents: 0,
      isCurrent: true,
    } satisfies PeriodResult);

  return { periods: results, byKey, usage, current, targetCents };
}

/** Progress for a period, 0–1. */
export function progressOf(result: Pick<PeriodResult, 'appliedCents' | 'targetCents'>): number {
  if (result.targetCents <= 0) return 0;
  return Math.min(1, result.appliedCents / result.targetCents);
}
