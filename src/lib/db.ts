import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Attachment, Bill, Settings, Submission } from './types';

interface SpendtallyDB extends DBSchema {
  bills: { key: string; value: Bill; indexes: { serviceDate: string } };
  attachments: { key: string; value: Attachment; indexes: { billId: string } };
  submissions: { key: string; value: Submission; indexes: { periodKey: string } };
  kv: { key: string; value: unknown };
}

export const DB_NAME = 'spendtally';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SpendtallyDB>> | null = null;

export function db(): Promise<IDBPDatabase<SpendtallyDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SpendtallyDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        const bills = database.createObjectStore('bills', { keyPath: 'id' });
        bills.createIndex('serviceDate', 'serviceDate');
        const att = database.createObjectStore('attachments', { keyPath: 'id' });
        att.createIndex('billId', 'billId');
        const subs = database.createObjectStore('submissions', { keyPath: 'id' });
        subs.createIndex('periodKey', 'periodKey');
        database.createObjectStore('kv');
      },
      blocking() {
        // Another tab opened a newer version: close so it can upgrade.
        void dbPromise?.then((d) => d.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** For tests: forget the cached connection. */
export async function closeDb(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) (await p).close();
}

export async function getSettings(): Promise<Settings | undefined> {
  return (await (await db()).get('kv', 'settings')) as Settings | undefined;
}

export async function putSettings(settings: Settings): Promise<void> {
  await (await db()).put('kv', settings, 'settings');
}

export async function listBills(): Promise<Bill[]> {
  return (await db()).getAll('bills');
}

export async function putBill(bill: Bill): Promise<void> {
  await (await db()).put('bills', bill);
}

export async function deleteBill(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['bills', 'attachments'], 'readwrite');
  await tx.objectStore('bills').delete(id);
  const atts = await tx.objectStore('attachments').index('billId').getAllKeys(id);
  await Promise.all(atts.map((k) => tx.objectStore('attachments').delete(k)));
  await tx.done;
}

export async function putAttachment(att: Attachment): Promise<void> {
  await (await db()).put('attachments', att);
}

export async function getAttachment(id: string): Promise<Attachment | undefined> {
  return (await db()).get('attachments', id);
}

export async function deleteAttachment(id: string): Promise<void> {
  await (await db()).delete('attachments', id);
}

export async function listAttachments(): Promise<Attachment[]> {
  return (await db()).getAll('attachments');
}

export async function listSubmissions(): Promise<Submission[]> {
  return (await db()).getAll('submissions');
}

export async function putSubmission(s: Submission): Promise<void> {
  await (await db()).put('submissions', s);
}

export async function deleteSubmission(id: string): Promise<void> {
  await (await db()).delete('submissions', id);
}

export async function clearAll(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['bills', 'attachments', 'submissions', 'kv'], 'readwrite');
  await Promise.all([
    tx.objectStore('bills').clear(),
    tx.objectStore('attachments').clear(),
    tx.objectStore('submissions').clear(),
    tx.objectStore('kv').clear(),
  ]);
  await tx.done;
}

export async function replaceAll(data: {
  settings: Settings;
  bills: Bill[];
  attachments: Attachment[];
  submissions: Submission[];
}): Promise<void> {
  await clearAll();
  const d = await db();
  const tx = d.transaction(['bills', 'attachments', 'submissions', 'kv'], 'readwrite');
  await Promise.all([
    ...data.bills.map((b) => tx.objectStore('bills').put(b)),
    ...data.attachments.map((a) => tx.objectStore('attachments').put(a)),
    ...data.submissions.map((s) => tx.objectStore('submissions').put(s)),
    tx.objectStore('kv').put(data.settings, 'settings'),
  ]);
  await tx.done;
}
