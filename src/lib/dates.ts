import type { ISODate, MonthKey } from './types';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function monthKeyOf(date: ISODate | Date): MonthKey {
  if (date instanceof Date) return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  return date.slice(0, 7);
}

/** Months since year 0 — handy for period arithmetic. */
export function monthIndex(key: MonthKey): number {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return y * 12 + (m - 1);
}

export function monthFromIndex(index: number): MonthKey {
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return `${y}-${pad2(m)}`;
}

export function addMonths(key: MonthKey, n: number): MonthKey {
  return monthFromIndex(monthIndex(key) + n);
}

export function compareMonths(a: MonthKey, b: MonthKey): number {
  return monthIndex(a) - monthIndex(b);
}

export function isValidISODate(value: string): value is ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function isValidMonthKey(value: string): value is MonthKey {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthName(key: MonthKey, style: 'long' | 'short' = 'long'): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const name = MONTHS[m - 1] ?? '';
  return `${style === 'short' ? name.slice(0, 3) : name} ${y}`;
}

/** `2026-03` → `Mar` */
export function monthShort(key: MonthKey): string {
  const m = Number(key.slice(5, 7));
  return (MONTHS[m - 1] ?? '').slice(0, 3);
}

export function formatDate(iso: ISODate, style: 'long' | 'short' = 'short'): string {
  if (!isValidISODate(iso)) return '—';
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const name = MONTHS[m - 1] ?? '';
  return style === 'long' ? `${name} ${d}, ${y}` : `${name.slice(0, 3)} ${d}, ${y}`;
}

/** `MM/DD/YYYY` — the format most state forms use. */
export function formatDateUS(iso: ISODate): string {
  if (!isValidISODate(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

export function lastDayOfMonth(key: MonthKey): ISODate {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const d = new Date(y, m, 0).getDate();
  return `${key}-${pad2(d)}`;
}

export { MONTHS };
