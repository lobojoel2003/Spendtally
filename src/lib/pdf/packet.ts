/**
 * Builds the submission packet: a cover sheet, a bill list with totals, and a copy of every bill.
 * Letter size, black and white, large type, so it survives a fax machine.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatDateUS, monthKeyOf, monthName } from '../dates';
import { formatCents } from '../money';
import type { Bill, Profile, StateRules } from '../types';

export interface PacketAttachment {
  mime: string;
  name: string;
  bytes: Uint8Array;
}

export interface PacketBill {
  bill: Bill;
  /** Estimated cents counted toward this period's spend-down. */
  countedCents: number;
  attachments: PacketAttachment[];
}

export interface PacketInput {
  profile: Profile;
  state: Pick<StateRules, 'name' | 'programName' | 'agency' | 'spenddownTerm'>;
  periodLabel: string;
  /** e.g. `11/01/2026 – 11/30/2026` */
  periodRange: string;
  targetCents: number;
  bills: PacketBill[];
  method?: string | undefined;
  generatedAt?: Date;
  appVersion?: string;
}

const PAGE_W = 612;
const PAGE_H = 792;
const M = 54;
const INK = rgb(0, 0, 0);
const GRAY = rgb(0.35, 0.35, 0.35);
const LIGHT = rgb(0.92, 0.92, 0.92);
const RULE = rgb(0.6, 0.6, 0.6);

const CATEGORY_LABEL: Record<string, string> = {
  doctor: 'Doctor',
  hospital: 'Hospital',
  pharmacy: 'Pharmacy',
  dental: 'Dental',
  vision: 'Vision',
  lab: 'Lab / imaging',
  therapy: 'Therapy',
  equipment: 'Equipment',
  transport: 'Transport',
  premium: 'Premium',
  'home-care': 'Home care',
  other: 'Other',
};

/** Standard PDF fonts only cover WinAnsi. Replace anything else so generation never fails. */
export function safeText(s: string): string {
  return (s ?? '')
    .normalize('NFC')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…€™]/g, '?');
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    // Break words that are longer than the line on their own.
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  let s = safeText(text);
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, size) > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

function text(
  page: PDFPage,
  s: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = INK,
) {
  page.drawText(safeText(s), { x, y, size, font, color });
}

function textRight(
  page: PDFPage,
  s: string,
  right: number,
  y: number,
  size: number,
  font: PDFFont,
  color = INK,
) {
  const t = safeText(s);
  page.drawText(t, { x: right - font.widthOfTextAtSize(t, size), y, size, font, color });
}

function totalCents(bills: PacketBill[]) {
  return bills.reduce((s, b) => s + b.bill.amountCents, 0);
}

function countedCents(bills: PacketBill[]) {
  return bills.reduce((s, b) => s + b.countedCents, 0);
}

interface Slot {
  page: PDFPage;
  x: number;
  y: number;
}

function drawCover(doc: PDFDocument, f: Fonts, input: PacketInput): Slot {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const { profile, state } = input;
  let y = PAGE_H - M - 30;

  if (input.method === 'fax') {
    text(page, 'FAX', M, y + 4, 12, f.bold, GRAY);
  }
  text(page, 'Medicaid Spend-down Bill Submission', M, y - 16, 22, f.bold);
  y -= 40;
  text(page, `${state.programName} — ${state.name}`, M, y, 12, f.regular, GRAY);
  y -= 14;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 1.5, color: INK });
  y -= 26;

  // To / From
  const colW = (PAGE_W - 2 * M - 20) / 2;
  const block = (title: string, lines: [string, string][], x: number, top: number) => {
    text(page, title, x, top, 10, f.bold, GRAY);
    let yy = top - 18;
    for (const [label, value] of lines) {
      text(page, label, x, yy, 9, f.regular, GRAY);
      const wrapped = wrapText(value || '—', f.bold, 11.5, colW - 70);
      wrapped.slice(0, 3).forEach((ln, i) => text(page, ln, x + 70, yy - i * 14, 11.5, f.bold));
      yy -= 14 * Math.min(3, wrapped.length) + 6;
    }
    return yy;
  };
  const yTo = block(
    'TO',
    [
      ['Office', profile.agencyName || state.agency],
      ['Attn', profile.caseworker || 'Spend-down / Excess income unit'],
      ['Fax', profile.agencyFax],
    ],
    M,
    y,
  );
  const yFrom = block(
    'FROM',
    [
      ['Name', profile.fullName],
      ['Phone', profile.phone],
      ['Address', profile.address],
    ],
    M + colW + 20,
    y,
  );
  y = Math.min(yTo, yFrom) - 10;

  // Key facts box
  const facts: [string, string][] = [
    ['Name', profile.fullName || '—'],
    ['Medicaid ID / CIN', profile.medicaidId || '—'],
    ['Case number', profile.caseNumber || '—'],
    [
      'Date of birth',
      profile.dateOfBirth ? formatDateUS(profile.dateOfBirth) || profile.dateOfBirth : '—',
    ],
    ['Spend-down period', `${input.periodLabel}  (${input.periodRange})`],
    [`${capitalize(state.spenddownTerm)} amount`, formatCents(input.targetCents)],
    ['Bills enclosed', `${input.bills.length}`],
    ['Total of enclosed bills', formatCents(totalCents(input.bills))],
    ['Pages (with this one)', '{{PAGES}}'],
  ];
  const rowH = 26;
  const boxH = facts.length * rowH + 12;
  page.drawRectangle({
    x: M,
    y: y - boxH,
    width: PAGE_W - 2 * M,
    height: boxH,
    borderColor: INK,
    borderWidth: 1.2,
  });
  let fy = y - 24;
  let pagesSlot: Slot = { page, x: M + 200, y: fy };
  facts.forEach(([label, value], i) => {
    if (i % 2 === 1) {
      page.drawRectangle({
        x: M + 1,
        y: fy - 8,
        width: PAGE_W - 2 * M - 2,
        height: rowH,
        color: LIGHT,
      });
    }
    text(page, label, M + 14, fy, 11, f.regular, GRAY);
    if (value === '{{PAGES}}') {
      pagesSlot = { page, x: M + 200, y: fy };
    } else {
      text(page, truncate(value, f.bold, 13, PAGE_W - 2 * M - 214), M + 200, fy, 13, f.bold);
    }
    fy -= rowH;
  });
  y = y - boxH - 30;

  const statement = `I am sending the enclosed medical bills and receipts to meet my ${state.spenddownTerm} for the period above. Please apply them to my case and turn on my Medicaid coverage. Bills are listed by date of service on the next page.`;
  for (const line of wrapText(statement, f.regular, 12, PAGE_W - 2 * M)) {
    text(page, line, M, y, 12, f.regular);
    y -= 17;
  }
  y -= 40;
  page.drawLine({ start: { x: M, y }, end: { x: M + 300, y }, thickness: 0.8, color: INK });
  page.drawLine({
    start: { x: M + 340, y },
    end: { x: PAGE_W - M, y },
    thickness: 0.8,
    color: INK,
  });
  text(page, 'Signature', M, y - 14, 10, f.regular, GRAY);
  text(page, 'Date', M + 340, y - 14, 10, f.regular, GRAY);

  return pagesSlot;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

interface Column {
  label: string;
  width: number;
  align?: 'right';
}

const COLUMNS: Column[] = [
  { label: '#', width: 22 },
  { label: 'Date of service', width: 72 },
  { label: 'Provider', width: 148 },
  { label: 'Type', width: 64 },
  { label: 'Status', width: 50 },
  { label: 'Bill amount', width: 72, align: 'right' },
  { label: 'Counted*', width: 76, align: 'right' },
];

function drawBillList(doc: PDFDocument, f: Fonts, input: PacketInput): void {
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M - 34;
  const size = 9.5;
  const rowH = 20;

  const header = (p: PDFPage, top: number, cont = false) => {
    text(
      p,
      cont ? `Bill list — ${input.periodLabel} (continued)` : `Bill list — ${input.periodLabel}`,
      M,
      top,
      16,
      f.bold,
    );
    let yy = top - 26;
    p.drawRectangle({ x: M, y: yy - 6, width: PAGE_W - 2 * M, height: rowH, color: INK });
    let x = M;
    for (const c of COLUMNS) {
      if (c.align === 'right')
        textRight(p, c.label, x + c.width - 5, yy, 8.5, f.bold, rgb(1, 1, 1));
      else text(p, c.label, x + 5, yy, 8.5, f.bold, rgb(1, 1, 1));
      x += c.width;
    }
    yy -= rowH;
    return yy;
  };

  y = header(page, y);
  const ensure = (needed: number) => {
    if (y - needed < M + 40) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = header(page, PAGE_H - M - 34, true);
    }
  };

  const sorted = [...input.bills].sort((a, b) =>
    a.bill.serviceDate < b.bill.serviceDate ? -1 : 1,
  );
  const months = [...new Set(sorted.map((b) => monthKeyOf(b.bill.serviceDate)))];
  const multiMonth = months.length > 1;
  let n = 0;

  for (const month of months) {
    const group = sorted.filter((b) => monthKeyOf(b.bill.serviceDate) === month);
    if (multiMonth) {
      ensure(rowH * 2);
      text(page, monthName(month), M + 5, y, 10, f.bold);
      y -= rowH;
    }
    for (const pb of group) {
      ensure(rowH);
      n++;
      const b = pb.bill;
      if (n % 2 === 0)
        page.drawRectangle({ x: M, y: y - 6, width: PAGE_W - 2 * M, height: rowH, color: LIGHT });
      const cells = [
        String(n),
        formatDateUS(b.serviceDate),
        b.provider || 'Unknown provider',
        CATEGORY_LABEL[b.category] ?? 'Other',
        b.status === 'paid' ? 'Paid' : 'Unpaid',
        formatCents(b.amountCents),
        pb.countedCents ? formatCents(pb.countedCents) : '—',
      ];
      let x = M;
      COLUMNS.forEach((c, i) => {
        const value = truncate(cells[i] ?? '', f.regular, size, c.width - 10);
        if (c.align === 'right')
          textRight(page, value, x + c.width - 5, y, size, i === 6 ? f.bold : f.regular);
        else text(page, value, x + 5, y, size, f.regular);
        x += c.width;
      });
      y -= rowH;
    }
    if (multiMonth) {
      ensure(rowH);
      textRight(page, `${monthName(month)} subtotal`, M + 356 - 5, y, size, f.regular, GRAY);
      textRight(page, formatCents(totalCents(group)), M + 428 - 5, y, size, f.regular, GRAY);
      textRight(page, formatCents(countedCents(group)), PAGE_W - M - 5, y, size, f.bold, GRAY);
      y -= rowH;
    }
  }

  ensure(rowH * 6);
  y -= 4;
  page.drawLine({
    start: { x: M, y: y + 12 },
    end: { x: PAGE_W - M, y: y + 12 },
    thickness: 1.2,
    color: INK,
  });
  const total = totalCents(input.bills);
  const counted = countedCents(input.bills);
  const rows: [string, string, boolean][] = [
    ['Total of all bills listed', formatCents(total), true],
    ['Estimated amount counted toward spend-down', formatCents(counted), true],
    [
      `${capitalize(input.state.spenddownTerm)} amount for this period`,
      formatCents(input.targetCents),
      false,
    ],
    [
      counted >= input.targetCents ? 'Spend-down met' : 'Still needed to meet spend-down',
      counted >= input.targetCents ? 'Yes' : formatCents(input.targetCents - counted),
      false,
    ],
  ];
  for (const [label, value, bold] of rows) {
    textRight(page, label, PAGE_W - M - 110, y, 11, f.regular);
    textRight(page, value, PAGE_W - M - 5, y, 11, bold ? f.bold : f.regular);
    y -= 18;
  }
  y -= 10;
  const note =
    '* Counted is an estimate. Paid bills count only in the month of service. An unpaid bill from a Medicaid provider can only be used for one month. The part of a bill used for the spend-down is not paid by Medicaid. Your Medicaid office makes the final decision.';
  for (const line of wrapText(note, f.regular, 8.5, PAGE_W - 2 * M)) {
    ensure(12);
    text(page, line, M, y, 8.5, f.regular, GRAY);
    y -= 12;
  }
}

function copyLabel(pb: PacketBill, i: number, n: number): string {
  const b = pb.bill;
  return `Bill ${i} of ${n}  ·  ${b.provider || 'Unknown provider'}  ·  Date of service ${formatDateUS(b.serviceDate)}  ·  ${formatCents(b.amountCents)} ${b.status === 'paid' ? 'paid' : 'unpaid'}`;
}

async function drawCopies(doc: PDFDocument, f: Fonts, input: PacketInput): Promise<void> {
  const sorted = [...input.bills].sort((a, b) =>
    a.bill.serviceDate < b.bill.serviceDate ? -1 : 1,
  );
  const n = sorted.length;
  for (let i = 0; i < sorted.length; i++) {
    const pb = sorted[i]!;
    const label = copyLabel(pb, i + 1, n);
    for (const att of pb.attachments) {
      if (att.mime === 'application/pdf') {
        try {
          const src = await PDFDocument.load(att.bytes, { ignoreEncryption: true });
          const pages = await doc.copyPages(src, src.getPageIndices());
          for (const p of pages) {
            doc.addPage(p);
            const { width, height } = p.getSize();
            const t = truncate(label, f.bold, 8.5, width - 40);
            p.drawRectangle({
              x: 14,
              y: height - 22,
              width: f.bold.widthOfTextAtSize(t, 8.5) + 12,
              height: 15,
              color: rgb(1, 1, 1),
              opacity: 0.9,
            });
            text(p, t, 20, height - 18, 8.5, f.bold);
          }
        } catch {
          const p = doc.addPage([PAGE_W, PAGE_H]);
          text(p, truncate(label, f.bold, 10, PAGE_W - 2 * M), M, PAGE_H - M - 34, 10, f.bold);
          text(
            p,
            `The file "${att.name}" could not be included (it may be password protected).`,
            M,
            PAGE_H - M - 64,
            11,
            f.regular,
          );
          text(p, 'Please attach a printed copy of this bill.', M, PAGE_H - M - 80, 11, f.regular);
        }
        continue;
      }
      const img =
        att.mime === 'image/png' ? await doc.embedPng(att.bytes) : await doc.embedJpg(att.bytes);
      const p = doc.addPage([PAGE_W, PAGE_H]);
      const top = PAGE_H - M - 34;
      p.drawRectangle({ x: M, y: top - 6, width: PAGE_W - 2 * M, height: 20, color: LIGHT });
      text(p, truncate(label, f.bold, 9.5, PAGE_W - 2 * M - 10), M + 5, top, 9.5, f.bold);
      const boxW = PAGE_W - 2 * M;
      const boxH = top - 16 - (M + 16);
      const scale = Math.min(boxW / img.width, boxH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      p.drawImage(img, { x: M + (boxW - w) / 2, y: top - 16 - h, width: w, height: h });
      p.drawRectangle({
        x: M + (boxW - w) / 2,
        y: top - 16 - h,
        width: w,
        height: h,
        borderColor: RULE,
        borderWidth: 0.5,
      });
    }
  }
}

function stampPages(doc: PDFDocument, f: Fonts, input: PacketInput, pagesSlot: Slot): void {
  const pages = doc.getPages();
  const total = pages.length;
  const who = [
    input.profile.fullName,
    input.profile.medicaidId ? `Medicaid ID ${input.profile.medicaidId}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');
  pages.forEach((p, i) => {
    const { width, height } = p.getSize();
    const right = `Page ${i + 1} of ${total}`;
    const y = height - 28;
    if (who) text(p, truncate(who, f.regular, 9, width - 200), 36, y, 9, f.regular, GRAY);
    textRight(p, right, width - 36, y, 9, f.regular, GRAY);
    if (i === 0) {
      const footer = `Prepared with Spendtally${input.appVersion ? ` ${input.appVersion}` : ''} on ${formatDateUS((input.generatedAt ?? new Date()).toISOString().slice(0, 10))}`;
      text(p, footer, 36, 24, 8, f.regular, GRAY);
    }
  });
  text(pagesSlot.page, String(total), pagesSlot.x, pagesSlot.y, 13, f.bold);
}

export async function buildPacket(input: PacketInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const when = input.generatedAt ?? new Date();
  doc.setTitle(safeText(`Spend-down bills — ${input.periodLabel}`));
  doc.setSubject(safeText(`${input.state.programName} (${input.state.name})`));
  if (input.profile.fullName) doc.setAuthor(safeText(input.profile.fullName));
  doc.setCreator('Spendtally');
  doc.setProducer('Spendtally (pdf-lib)');
  doc.setCreationDate(when);
  doc.setModificationDate(when);

  const pagesSlot = drawCover(doc, fonts, input);
  drawBillList(doc, fonts, input);
  await drawCopies(doc, fonts, input);
  stampPages(doc, fonts, input, pagesSlot);
  return doc.save();
}
