import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE } from '../../src/lib/defaults';
import { buildPacket, safeText, wrapText } from '../../src/lib/pdf/packet';
import { bill } from './helpers';

const jpg = new Uint8Array(readFileSync(new URL('../fixtures/bill.jpg', import.meta.url)));
const state = {
  name: 'New York',
  programName: 'Excess Income Program',
  agency: 'HRA',
  spenddownTerm: 'spenddown',
};

async function attachmentPdf(pages: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([400, 500]);
  return d.save();
}

describe('buildPacket', () => {
  it('creates cover sheet, bill list and copies', async () => {
    const bytes = await buildPacket({
      profile: {
        ...EMPTY_PROFILE,
        fullName: 'Rose Alvarez',
        medicaidId: 'AB12345C',
        agencyFax: '(518) 555-0100',
      },
      state,
      periodLabel: 'November 2026',
      periodRange: '11/01/2026 – 11/30/2026',
      targetCents: 50000,
      method: 'fax',
      appVersion: '1.0.0',
      generatedAt: new Date('2026-11-19T12:00:00Z'),
      bills: [
        {
          bill: bill({ provider: 'Mercy General Hospital', amountCents: 39128 }),
          countedCents: 39128,
          attachments: [{ mime: 'image/jpeg', name: 'a.jpg', bytes: jpg }],
        },
        {
          bill: bill({ provider: 'Walgreens', amountCents: 1250, serviceDate: '2026-11-03' }),
          countedCents: 1250,
          attachments: [{ mime: 'application/pdf', name: 'b.pdf', bytes: await attachmentPdf(2) }],
        },
        {
          bill: bill({ provider: 'Café Médico – Ünïcødé ✓ 漢字', amountCents: 9000 }),
          countedCents: 9000,
          attachments: [],
        },
      ],
    });
    const doc = await PDFDocument.load(bytes);
    // cover + list + 1 image page + 2 copied PDF pages
    expect(doc.getPageCount()).toBe(5);
    expect(doc.getTitle()).toBe('Spend-down bills — November 2026');
    expect(doc.getAuthor()).toBe('Rose Alvarez');
    expect(doc.getCreator()).toBe('Spendtally');
  });

  it('spills long bill lists onto extra pages and survives a broken PDF attachment', async () => {
    const bills = Array.from({ length: 45 }, (_, i) => ({
      bill: bill({
        provider: `Provider ${i}`,
        serviceDate: i < 20 ? '2026-07-10' : '2026-08-10',
        amountCents: 1000 + i,
      }),
      countedCents: 1000,
      attachments: [] as { mime: string; name: string; bytes: Uint8Array }[],
    }));
    bills[0]!.attachments.push({
      mime: 'application/pdf',
      name: 'broken.pdf',
      bytes: new Uint8Array([1, 2, 3]),
    });
    const bytes = await buildPacket({
      profile: EMPTY_PROFILE,
      state,
      periodLabel: 'Jul – Dec 2026',
      periodRange: '07/01/2026 – 12/31/2026',
      targetCents: 300000,
      bills,
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);
  });
});

describe('text helpers', () => {
  it('replaces characters the standard fonts cannot draw', () => {
    expect(safeText('Café – “ok” ✓ 漢')).toBe('Café – “ok” ? ?');
    expect(safeText('a\nb')).toBe('a b');
  });

  it('wraps text to width', async () => {
    const d = await PDFDocument.create();
    const font = await d.embedFont('Helvetica');
    const lines = wrapText('one two three four five six seven eight nine ten', font, 12, 80);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(font.widthOfTextAtSize(l, 12)).toBeLessThanOrEqual(80);
    expect(wrapText('Supercalifragilisticexpialidocious', font, 12, 50).length).toBeGreaterThan(1);
  });
});
