import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as db from '../../src/lib/db';
import { defaultSettings, newBill, normalizeSettings } from '../../src/lib/defaults';
import * as store from '../../src/lib/store';
import { bill } from './helpers';

beforeEach(async () => {
  await db.clearAll();
  await store.loadAll();
});

describe('db', () => {
  it('stores bills, attachments and submissions', async () => {
    const b = bill({ id: 'db1', attachmentIds: ['a1'] });
    await db.putBill(b);
    await db.putAttachment({
      id: 'a1',
      billId: 'db1',
      mime: 'image/jpeg',
      name: 'x.jpg',
      blob: new Blob(['x']),
      createdAt: 'now',
    });
    await db.putSubmission({
      id: 's1',
      periodKey: '2026-11',
      createdAt: 'now',
      applied: {},
      billIds: [],
      totalCents: 0,
      method: 'fax',
    });
    expect(await db.listBills()).toHaveLength(1);
    expect((await db.getAttachment('a1'))?.name).toBe('x.jpg');
    expect(await db.listAttachments()).toHaveLength(1);
    expect(await db.listSubmissions()).toHaveLength(1);

    await db.deleteBill('db1');
    expect(await db.listBills()).toHaveLength(0);
    expect(await db.listAttachments()).toHaveLength(0);

    await db.deleteSubmission('s1');
    expect(await db.listSubmissions()).toHaveLength(0);
  });

  it('replaces everything on restore', async () => {
    await db.putBill(bill({ id: 'old' }));
    await db.replaceAll({
      settings: { ...defaultSettings(), stateCode: 'WA' },
      bills: [bill({ id: 'new' })],
      attachments: [],
      submissions: [],
    });
    expect((await db.listBills()).map((b) => b.id)).toEqual(['new']);
    expect((await db.getSettings())?.stateCode).toBe('WA');
  });

  it('reopens after closing', async () => {
    await db.closeDb();
    expect(await db.listBills()).toEqual([]);
  });
});

describe('store', () => {
  it('saves settings and bills and recomputes the ledger', async () => {
    await store.updateSettings({
      onboarded: true,
      stateCode: 'NY',
      spenddownCents: 50000,
      periodAnchor: '2026-11',
    });
    store.today.value = '2026-11-19';
    expect(store.rules.value.code).toBe('NY');
    await store.saveBill(
      newBill({ provider: 'A', serviceDate: '2026-11-02', amountCents: 30000, status: 'paid' }),
    );
    expect(store.ledger.value.current.appliedCents).toBe(30000);

    await store.loadAll();
    expect(store.settings.value.spenddownCents).toBe(50000);
    expect(store.bills.value).toHaveLength(1);
  });

  it('removes bills and tracks submissions', async () => {
    const b = newBill({ serviceDate: '2026-11-02', amountCents: 100 });
    await store.saveBill(b);
    await store.addAttachment({
      id: 'att',
      billId: b.id,
      mime: 'image/jpeg',
      name: 'p',
      blob: new Blob(['p']),
      createdAt: 'now',
    });
    await store.removeAttachment('att');
    await store.addSubmission({
      id: 's',
      periodKey: '2026-11',
      createdAt: 'now',
      applied: { [b.id]: 100 },
      billIds: [b.id],
      totalCents: 100,
      method: 'mail',
    });
    expect(store.submissions.value).toHaveLength(1);
    await store.removeSubmission('s');
    expect(store.submissions.value).toHaveLength(0);
    await store.removeBill(b.id);
    expect(store.bills.value).toHaveLength(0);
  });

  it('flags duplicates and resets everything', async () => {
    await store.saveBill(
      bill({ id: 'd1', provider: 'Lab Co', serviceDate: '2026-11-01', amountCents: 500 }),
    );
    await store.saveBill(
      bill({ id: 'd2', provider: 'LAB CO.', serviceDate: '2026-11-01', amountCents: 500 }),
    );
    expect(store.duplicates.value.get('d1')).toEqual(['d2']);
    await store.resetEverything();
    expect(store.bills.value).toEqual([]);
    expect(store.settings.value.onboarded).toBe(false);
  });

  it('restores from backup data', async () => {
    await store.restore({
      settings: normalizeSettings({ stateCode: 'MO', onboarded: true }),
      bills: [bill({ id: 'r1' })],
      attachments: [],
      submissions: [],
    });
    expect(store.settings.value.stateCode).toBe('MO');
    expect(store.bills.value.map((b) => b.id)).toEqual(['r1']);
  });
});
