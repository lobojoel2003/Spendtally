import { addMonths, monthIndex, monthFromIndex, monthName, monthShort } from './dates';
import type { MonthKey, Settings } from './types';

export interface Period {
  /** Key of a period = its first month. */
  key: MonthKey;
  start: MonthKey;
  end: MonthKey;
  months: MonthKey[];
  length: number;
}

function clampLength(length: number): number {
  if (!Number.isFinite(length)) return 1;
  return Math.min(12, Math.max(1, Math.round(length)));
}

/** The spend-down period containing `month`, given periods of `length` months tiled from `anchor`. */
export function periodFor(month: MonthKey, anchor: MonthKey, length: number): Period {
  const len = clampLength(length);
  const offset = monthIndex(month) - monthIndex(anchor);
  const n = Math.floor(offset / len);
  const startIndex = monthIndex(anchor) + n * len;
  return makePeriod(monthFromIndex(startIndex), len);
}

export function makePeriod(start: MonthKey, length: number): Period {
  const len = clampLength(length);
  const months = Array.from({ length: len }, (_, i) => addMonths(start, i));
  return { key: start, start, end: months[months.length - 1] ?? start, months, length: len };
}

/** All periods from the one containing `from` up to and including the one containing `to`. */
export function periodsBetween(
  from: MonthKey,
  to: MonthKey,
  anchor: MonthKey,
  length: number,
  max = 240,
): Period[] {
  const first = periodFor(from, anchor, length);
  const last = periodFor(to, anchor, length);
  const out: Period[] = [];
  let cur = first;
  while (monthIndex(cur.start) <= monthIndex(last.start) && out.length < max) {
    out.push(cur);
    cur = makePeriod(addMonths(cur.start, cur.length), cur.length);
  }
  return out;
}

export function nextPeriod(p: Period): Period {
  return makePeriod(addMonths(p.start, p.length), p.length);
}

export function previousPeriod(p: Period): Period {
  return makePeriod(addMonths(p.start, -p.length), p.length);
}

export function periodContains(p: Period, month: MonthKey): boolean {
  const i = monthIndex(month);
  return i >= monthIndex(p.start) && i <= monthIndex(p.end);
}

export function periodLabel(p: Period, style: 'long' | 'short' = 'long'): string {
  if (p.length === 1) return monthName(p.start, style);
  const sameYear = p.start.slice(0, 4) === p.end.slice(0, 4);
  if (sameYear) return `${monthShort(p.start)} – ${monthShort(p.end)} ${p.end.slice(0, 4)}`;
  return `${monthName(p.start, 'short')} – ${monthName(p.end, 'short')}`;
}

/** Spend-down target for one period, in cents. */
export function periodTargetCents(
  settings: Pick<Settings, 'spenddownCents' | 'amountBasis' | 'periodMonths'>,
): number {
  const len = clampLength(settings.periodMonths);
  const cents = Math.max(0, Math.round(settings.spenddownCents || 0));
  return settings.amountBasis === 'period' ? cents : cents * len;
}
