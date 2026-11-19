/** App state: Preact signals backed by IndexedDB. */
import { computed, signal } from '@preact/signals';
import * as store from './db';
import { normalizeSettings } from './defaults';
import { computeLedger } from './engine';
import { getStateRules } from './rules';
import { todayISO } from './dates';
import { findDuplicates } from './warnings';
import type { Attachment, Bill, Settings, Submission } from './types';

export const ready = signal(false);
export const settings = signal<Settings>(normalizeSettings(undefined));
export const bills = signal<Bill[]>([]);
export const submissions = signal<Submission[]>([]);
export const today = signal(todayISO());

export const rules = computed(() => getStateRules(settings.value.stateCode));

export const ledger = computed(() =>
  computeLedger({
    bills: bills.value,
    settings: settings.value,
    rules: rules.value,
    submissions: submissions.value,
    today: today.value,
  }),
);

export const duplicates = computed(() => findDuplicates(bills.value));

export async function loadAll(): Promise<void> {
  const [s, b, subs] = await Promise.all([
    store.getSettings(),
    store.listBills(),
    store.listSubmissions(),
  ]);
  settings.value = normalizeSettings(s);
  bills.value = b;
  submissions.value = subs;
  ready.value = true;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const next = { ...settings.value, ...patch };
  settings.value = next;
  await store.putSettings(next);
}

export async function saveBill(bill: Bill): Promise<void> {
  const next = { ...bill, updatedAt: new Date().toISOString() };
  const list = bills.value.filter((b) => b.id !== bill.id);
  bills.value = [...list, next];
  await store.putBill(next);
}

export async function removeBill(id: string): Promise<void> {
  bills.value = bills.value.filter((b) => b.id !== id);
  await store.deleteBill(id);
}

export async function addAttachment(att: Attachment): Promise<void> {
  await store.putAttachment(att);
}

export async function removeAttachment(id: string): Promise<void> {
  await store.deleteAttachment(id);
}

export async function addSubmission(sub: Submission): Promise<void> {
  submissions.value = [...submissions.value.filter((s) => s.id !== sub.id), sub];
  await store.putSubmission(sub);
}

export async function removeSubmission(id: string): Promise<void> {
  submissions.value = submissions.value.filter((s) => s.id !== id);
  await store.deleteSubmission(id);
}

export async function resetEverything(): Promise<void> {
  await store.clearAll();
  settings.value = normalizeSettings(undefined);
  bills.value = [];
  submissions.value = [];
}

export async function restore(data: Parameters<typeof store.replaceAll>[0]): Promise<void> {
  await store.replaceAll(data);
  await loadAll();
}

/** Keeps `today` fresh if the app stays open past midnight. */
export function startClock(): () => void {
  const id = setInterval(() => {
    const t = todayISO();
    if (t !== today.value) today.value = t;
  }, 60_000);
  return () => clearInterval(id);
}
