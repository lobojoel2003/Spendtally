import { describe, expect, it } from 'vitest';
import {
  BackupError,
  base64ToBlob,
  blobToBase64,
  createBackup,
  readBackup,
} from '../../src/lib/backup';
import { defaultSettings } from '../../src/lib/defaults';
import { bill } from './helpers';

describe('backup', () => {
  it('round-trips settings, bills and attachments', async () => {
    const b = bill({ id: 'x1', attachmentIds: ['a1'] });
    const blob = new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' });
    const file = await createBackup({
      settings: { ...defaultSettings(), stateCode: 'NY', onboarded: true },
      bills: [b],
      submissions: [],
      attachments: [
        {
          id: 'a1',
          billId: 'x1',
          mime: 'image/jpeg',
          name: 'p.jpg',
          blob,
          thumb: blob,
          createdAt: 'now',
        },
      ],
      appVersion: '1.0.0',
    });
    const json = JSON.parse(JSON.stringify(file));
    const back = readBackup(json);
    expect(back.settings.stateCode).toBe('NY');
    expect(back.bills).toHaveLength(1);
    expect(back.attachments).toHaveLength(1);
    expect(new Uint8Array(await back.attachments[0]!.blob.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 250]),
    );
    expect(back.attachments[0]!.thumb).toBeDefined();
  });

  it('rejects files that are not backups', () => {
    expect(() => readBackup({ hello: 1 })).toThrow(BackupError);
    expect(() =>
      readBackup({ format: 'spendtally-backup', version: 99, bills: [], attachments: [] }),
    ).toThrow(/newer/);
    expect(() => readBackup({ format: 'spendtally-backup', version: 1 })).toThrow(/incomplete/);
  });

  it('encodes base64', async () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 256);
    const b64 = await blobToBase64(new Blob([big]));
    expect(new Uint8Array(await base64ToBlob(b64, 'x').arrayBuffer())).toEqual(big);
  });
});
