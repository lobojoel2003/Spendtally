import { formatCents } from './money';
import { compareMonths, monthKeyOf, monthName } from './dates';
import { countingMonth, type BillUsage, type Ledger } from './engine';
import { periodLabel, periodFor } from './periods';
import type { Bill, Settings, StateRules } from './types';

export type WarningLevel = 'info' | 'caution' | 'alert';

export interface BillWarning {
  code:
    | 'unpaid-medicaid-one-month'
    | 'non-medicaid-provider'
    | 'unknown-provider'
    | 'spenddown-portion'
    | 'paid-other-month'
    | 'before-first-period'
    | 'future-date'
    | 'duplicate'
    | 'no-copy'
    | 'medicaid-may-pay';
  level: WarningLevel;
  title: string;
  detail: string;
}

function normalizeProvider(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);
}

export function findDuplicates(bills: Bill[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const b of bills) {
    if (!b.amountCents || !b.serviceDate) continue;
    const key = `${normalizeProvider(b.provider)}|${b.serviceDate}|${b.amountCents}`;
    const list = groups.get(key) ?? [];
    list.push(b.id);
    groups.set(key, list);
  }
  const dupes = new Map<string, string[]>();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    for (const id of ids)
      dupes.set(
        id,
        ids.filter((x) => x !== id),
      );
  }
  return dupes;
}

export interface WarningContext {
  settings: Pick<Settings, 'periodAnchor' | 'periodMonths'>;
  rules?: (Pick<StateRules, 'rules' | 'spenddownTerm'> & Partial<Pick<StateRules, 'name'>>) | null;
  usage?: BillUsage | undefined;
  duplicates?: Map<string, string[]>;
  today: string;
}

/** Plain-language warnings for one bill, most important first. */
export function billWarnings(bill: Bill, ctx: WarningContext): BillWarning[] {
  const out: BillWarning[] = [];
  const term = ctx.rules?.spenddownTerm ?? 'spend-down';
  const oneMonth = ctx.rules?.rules.unpaidMedicaidProviderOneMonth !== false;
  const serviceMonth = bill.serviceDate ? monthKeyOf(bill.serviceDate) : '';

  if (bill.serviceDate && bill.serviceDate > ctx.today) {
    out.push({
      code: 'future-date',
      level: 'alert',
      title: 'Date of service is in the future',
      detail: 'Check the date. Only care you have already received can count.',
    });
  }

  if (bill.status === 'unpaid' && bill.medicaidProvider === 'yes' && oneMonth) {
    out.push({
      code: 'unpaid-medicaid-one-month',
      level: 'caution',
      title: 'Counts for one month only',
      detail: `This is an unpaid bill from a Medicaid provider. It can turn on coverage for just one month: once your ${term} is met, Medicaid pays the rest of the bill, so it can't be used again next month.`,
    });
  }

  if (bill.medicaidProvider === 'no') {
    out.push({
      code: 'non-medicaid-provider',
      level: 'caution',
      title: 'Provider does not take Medicaid',
      detail: `The bill still counts toward your ${term}, but Medicaid will not pay this provider. You stay responsible for the whole bill.`,
    });
  } else if (bill.medicaidProvider === 'unknown') {
    out.push({
      code: 'unknown-provider',
      level: 'info',
      title: 'Does this provider take Medicaid?',
      detail:
        'Call and ask. If they do, Medicaid can pay what is left of their bills once you meet your spend-down. If not, you keep owing them.',
    });
  }

  if (ctx.usage && ctx.usage.appliedCents > 0) {
    out.push({
      code: 'spenddown-portion',
      level: 'info',
      title: `${formatCents(ctx.usage.appliedCents)} is your share`,
      detail: `The part of a bill used to meet your ${term} is never covered by Medicaid. You still owe (or already paid) that part.`,
    });
  }

  if (ctx.usage && ctx.usage.medicaidMayPayCents > 0) {
    out.push({
      code: 'medicaid-may-pay',
      level: 'info',
      title: `Medicaid may pay ${formatCents(ctx.usage.medicaidMayPayCents)}`,
      detail:
        'Your spend-down was met for this period, so Medicaid may pay the rest of this bill. Give the provider your Medicaid number.',
    });
  }

  if (
    bill.status === 'paid' &&
    bill.paidDate &&
    serviceMonth &&
    monthKeyOf(bill.paidDate) !== serviceMonth
  ) {
    const month = countingMonth(bill, ctx.rules);
    const period = periodLabel(
      periodFor(month, ctx.settings.periodAnchor, ctx.settings.periodMonths),
    );
    out.push({
      code: 'paid-other-month',
      level: 'info',
      title: `Counts for ${monthName(month)}`,
      detail:
        month === serviceMonth
          ? `Paid bills count only in the month you got the care, not the month you paid. This one counts toward ${period}.`
          : `${ctx.rules?.name ?? 'Your state'} counts paid bills in the month you paid them. This one counts toward ${period}. Ask your caseworker if you are unsure.`,
    });
  }

  if (ctx.usage?.closedReason === 'before-first-period' && serviceMonth) {
    out.push({
      code: 'before-first-period',
      level: 'caution',
      title: 'Before your first spend-down period',
      detail:
        compareMonths(serviceMonth, ctx.settings.periodAnchor) < 0 && bill.status === 'paid'
          ? 'Paid bills from before your spend-down started usually can’t count. Ask your caseworker about retroactive months.'
          : 'This bill is dated before your first period.',
    });
  }

  const dupes = ctx.duplicates?.get(bill.id);
  if (dupes && dupes.length) {
    out.push({
      code: 'duplicate',
      level: 'alert',
      title: 'Possible duplicate',
      detail: 'Another bill has the same provider, date and amount. Each bill can only count once.',
    });
  }

  if (!bill.attachmentIds.length) {
    out.push({
      code: 'no-copy',
      level: 'info',
      title: 'No copy attached',
      detail: 'Add a photo of the bill or receipt. Most offices need a copy to count it.',
    });
  }

  return out;
}

export interface Alert {
  id: string;
  level: WarningLevel;
  title: string;
  detail: string;
  action?: { label: string; href: string };
}

/** Home-screen alerts for the current situation. */
export function periodAlerts(
  ledger: Ledger,
  bills: Bill[],
  rules: Pick<StateRules, 'submission' | 'spenddownTerm' | 'name'> | null,
): Alert[] {
  const out: Alert[] = [];
  const cur = ledger.current;
  const term = rules?.spenddownTerm ?? 'spend-down';
  const billMap = new Map(bills.map((b) => [b.id, b]));

  for (const p of ledger.periods) {
    if (p.isCurrent || !p.met || p.submissions.length) continue;
    if (compareMonths(p.period.start, cur.period.start) > 0) continue;
    out.push({
      id: `unsent-${p.period.key}`,
      level: 'alert',
      title: `${periodLabel(p.period)} is met but not sent`,
      detail: `Your bills reach the ${term} for ${periodLabel(p.period)}. Send them so Medicaid can cover that period.`,
      action: { label: 'Build packet', href: `#/packet/${p.period.key}` },
    });
  }

  if (cur.targetCents > 0) {
    if (cur.met && !cur.submissions.length) {
      out.push({
        id: 'current-met',
        level: 'info',
        title: `${periodLabel(cur.period)} ${term} is met`,
        detail: 'Build your packet and send it to your Medicaid office.',
        action: { label: 'Build packet', href: `#/packet/${cur.period.key}` },
      });
    }
  }

  const unpaidMedicaid = cur.entries.filter((e) => {
    const b = billMap.get(e.billId);
    return b?.status === 'unpaid' && b.medicaidProvider === 'yes';
  });
  if (unpaidMedicaid.length) {
    out.push({
      id: 'one-month',
      level: 'caution',
      title: 'Unpaid Medicaid-provider bills work once',
      detail: `${unpaidMedicaid.length === 1 ? 'One unpaid bill' : `${unpaidMedicaid.length} unpaid bills`} from a Medicaid provider ${unpaidMedicaid.length === 1 ? 'is' : 'are'} counted this period. ${unpaidMedicaid.length === 1 ? 'It' : 'They'} can turn coverage on for just this month.`,
    });
  }

  const unknown = cur.billIds.filter(
    (id) => billMap.get(id)?.medicaidProvider === 'unknown',
  ).length;
  if (unknown) {
    out.push({
      id: 'unknown-providers',
      level: 'info',
      title: `${unknown} bill${unknown === 1 ? '' : 's'}: check if the provider takes Medicaid`,
      detail:
        'It decides whether Medicaid can pay the rest of the bill once you meet your spend-down.',
      action: { label: 'Review bills', href: '#/bills' },
    });
  }

  if (rules?.submission.payIn && !cur.met && cur.targetCents > 0) {
    out.push({
      id: 'pay-in',
      level: 'info',
      title: 'You can also pay in',
      detail: `${rules.name} lets you pay the ${term} amount to the Medicaid office instead of sending bills.`,
    });
  }

  return out;
}
