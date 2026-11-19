/**
 * Turns raw OCR text from a medical bill or receipt into suggested fields.
 * Every field carries a confidence (0–1) so the UI can ask the person to check it.
 */
import { isValidISODate, pad2 } from '../dates';
import { parseMoney } from '../money';
import type { BillCategory, BillStatus, ISODate } from '../types';

export interface Detected<T> {
  value: T;
  confidence: number;
  label?: string | undefined;
}

export interface DateCandidate {
  value: ISODate;
  score: number;
  label?: string | undefined;
  line: number;
}

export interface AmountCandidate {
  value: number;
  score: number;
  label?: string | undefined;
  line: number;
}

export interface ParsedBill {
  provider: Detected<string> | null;
  serviceDate: Detected<ISODate> | null;
  amount: Detected<number> | null;
  status: BillStatus | null;
  category: BillCategory | null;
  dates: DateCandidate[];
  amounts: AmountCandidate[];
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const MONTH_RE =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const SERVICE_LABEL =
  /(date\s*\(?s?\)?\s*of\s*serv|serv(?:ice)?\.?\s*(?:date|dt)|\bd\.?o\.?s\.?\b|svc\.?\s*(?:date|dt)|visit\s*date|date\s*of\s*visit|admi(?:t|ssion)\s*date|appointment|\bappt\b|treatment\s*date|fill(?:ed)?\s*date|date\s*filled|\brx\s*date|dispensed|from\s*date|procedure\s*date|date\s*of\s*care|seen\s*on)/i;
const NOT_SERVICE_LABEL =
  /(statement|due\b|due\s*date|print(?:ed)?|billing\s*date|bill\s*date|invoice\s*date|pay(?:ment)?\s*(?:by|date)|issued|mailed|run\s*date|posted|post\s*date|expir|exp\.?\s*date|as\s*of|refill\s*(?:by|before)|next\s*appointment)/i;
const BIRTH_LABEL = /(\bdob\b|d\.o\.b|birth|born)/i;

const DUE_LABEL =
  /((?:amount|balance|total)\s*(?:now\s*)?due|please\s*pay|pay\s*this\s*amount|patient\s*(?:responsibility|balance|portion|owes|pays?|share)|(?:amount\s*)?you\s*owe|your\s*(?:share|responsibility|balance|portion|cost)|new\s*balance|total\s*patient|balance\s*forward|amount\s*owed|guarantor\s*balance)/i;
const PAID_LABEL =
  /(amount\s*paid|total\s*paid|paid\s*amount|payment\s*received|you\s*paid|co-?pay|co-?insurance|\bpaid\b)/i;
const TOTAL_LABEL = /(grand\s*total|\btotal\b|\bbalance\b|\bamount\b|\bcharges?\b)/i;
const NEGATIVE_AMOUNT_LABEL =
  /(insurance|ins\.?\s*(?:paid|pmt|adj)|adjust|discount|plan\s*paid|medicare\s*(?:paid|approved|allowed)|allowed|contractual|write[-\s]?off|previous|prior\s*balance|\btax\b|subtotal|sub-total|change\b|tendered|cash\s*back|saved|savings|\bcredit\b|deductible\s*remaining|out[-\s]of[-\s]pocket\s*max|limit)/i;

const PROVIDER_HINT =
  /(hospital|medical|clinic|health|pharmacy|drug|physicians?|associates|center|centre|dental|dentist|\bdds\b|\bdmd\b|\bm\.?d\.?\b|\bd\.?o\.?\b|laborator|\blabs?\b|radiology|imaging|therapy|rehab|orthop|cardio|family\s*(?:practice|medicine)|urgent\s*care|\beye\b|vision|optic|optom|ambulance|transport|home\s*(?:care|health)|nursing|cvs|walgreens|rite\s*aid|kaiser|quest\s*diagnostics|labcorp|medicine|surgery|surgical|podiatr|dermatolog|oncology|neurolog|pediatric|psychiatr|counsel|hearing|audiolog|chiropract|supply|equipment|\bpc\b|\bllc\b|\bpllc\b|\bp\.?a\.?\b)/i;
const NOT_PROVIDER =
  /(statement|invoice|receipt|^page\b|patient|account|acct|date|bill\s*to|guarantor|phone|tel\b|fax\b|www\.|https?:|\.com\b|p\.?\s*o\.?\s*box|\bsuite\b|\bste\b|amount|balance|total|due|questions|customer|member|insurance|claim|summary|thank\s*you|please|\bvisit\b|remit|detach|return\s*this)/i;
const ADDRESS_LINE = /^\d+\s+\w+|\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b|\b\d{5}(?:-\d{4})?$/;
const PAYABLE_TO =
  /(remit\s*(?:payment\s*)?to|make\s*checks?\s*payable\s*to|payable\s*to|pay\s*to)\s*:?\s*(.*)$/i;

const CATEGORY_RULES: [BillCategory, RegExp][] = [
  ['premium', /(premium|medicare\s*part\s*[bd]|medigap|supplement(?:al)?\s*(?:plan|insurance))/i],
  [
    'pharmacy',
    /(pharmacy|\brx\b|prescription|drug\s*store|cvs|walgreens|rite\s*aid|dispensed|\bndc\b|refills?)/i,
  ],
  ['dental', /(dental|dentist|\bdds\b|\bdmd\b|orthodont)/i],
  ['vision', /(optical|optom|ophthalm|\beye\b|vision|eyeglass|contact\s*lens)/i],
  ['transport', /(ambulance|transport|\bcab\b|taxi|paratransit|mileage)/i],
  [
    'equipment',
    /(\bdme\b|medical\s*supply|equipment|wheelchair|oxygen|walker|cpap|hearing\s*aid)/i,
  ],
  [
    'lab',
    /(laborator|\blab\b|labcorp|quest\s*diag|pathology|radiology|imaging|x-?ray|\bmri\b|\bct\b\s*scan)/i,
  ],
  ['therapy', /(physical\s*therapy|occupational\s*therapy|speech\s*therapy|rehab|\bpt\b\s*visit)/i],
  ['home-care', /(home\s*(?:care|health)|home\s*aide|personal\s*care)/i],
  ['hospital', /(hospital|medical\s*center|emergency|inpatient|outpatient|\ber\b\s*visit)/i],
  [
    'doctor',
    /(physician|clinic|practice|\bm\.?d\.?\b|\bdr\.?\s|family\s*medicine|office\s*visit|urgent\s*care)/i,
  ],
];

/** Fix common OCR slips in numbers: O→0, l/I/|→1, S→5 when they sit next to digits. */
export function normalizeDigits(line: string): string {
  return line
    .replace(/(?<=\d)[Oo]|[Oo](?=\d)/g, '0')
    .replace(/(?<=\d)[lI|]|[lI|](?=\d)/g, '1')
    .replace(/(?<=\d)S(?=\d)/g, '5');
}

function toISO(y: number, m: number, d: number): ISODate | null {
  if (y < 100) y += y >= 70 ? 1900 : 2000;
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  return isValidISODate(iso) ? iso : null;
}

/** All dates found in a line of text, in order. */
export function findDates(line: string): { value: ISODate; index: number }[] {
  const out: { value: ISODate; index: number }[] = [];
  const s = normalizeDigits(line);
  const push = (v: ISODate | null, index: number) => {
    if (v && !out.some((o) => o.index === index)) out.push({ value: v, index });
  };
  for (const m of s.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    push(toISO(Number(m[1]), Number(m[2]), Number(m[3])), m.index ?? 0);
  }
  for (const m of s.matchAll(
    /(?<![\d/.-])(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})(?![\d/.-])/g,
  )) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    // US order (MM/DD) unless the first number can't be a month.
    const value = a > 12 && b <= 12 ? toISO(y, b, a) : toISO(y, a, b);
    push(value, m.index ?? 0);
  }
  const named = new RegExp(
    `\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
    'gi',
  );
  for (const m of s.matchAll(named)) {
    const month =
      MONTHS[(m[1] ?? '').slice(0, 4).toLowerCase()] ??
      MONTHS[(m[1] ?? '').slice(0, 3).toLowerCase()];
    if (month) push(toISO(Number(m[3]), month, Number(m[2])), m.index ?? 0);
  }
  const dayFirst = new RegExp(`\\b(\\d{1,2})\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, 'gi');
  for (const m of s.matchAll(dayFirst)) {
    const month = MONTHS[(m[2] ?? '').slice(0, 3).toLowerCase()];
    if (month) push(toISO(Number(m[3]), month, Number(m[1])), m.index ?? 0);
  }
  return out.sort((a, b) => a.index - b.index);
}

/** All money amounts in a line. Requires cents or a `$` so ZIP codes and account numbers are ignored. */
export function findAmounts(line: string): { value: number; index: number }[] {
  const s = normalizeDigits(line);
  const out: { value: number; index: number }[] = [];
  const re =
    /(\(?-?\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?|\(?-?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}\)?-?|\(?-?\$?\s?\d+\.\d{2}\)?-?)/g;
  for (const m of s.matchAll(re)) {
    const raw = m[0];
    const idx = m.index ?? 0;
    // Skip parts of dates (e.g. 03.15.26) and percentages.
    const after = s.slice(idx + raw.length, idx + raw.length + 1);
    const before = s.slice(Math.max(0, idx - 1), idx);
    if (after === '%' || /[\d/.]/.test(before)) continue;
    const cents = parseMoney(raw);
    if (cents === null || cents < 0 || cents > 100_000_000) continue;
    out.push({ value: cents, index: idx });
  }
  return out;
}

function labelBefore(line: string, index: number): string {
  return line.slice(0, index);
}

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      const bare = w.replace(/[^a-z]/g, '');
      if (
        [
          'md',
          'do',
          'dds',
          'dmd',
          'pc',
          'llc',
          'pllc',
          'pa',
          'cvs',
          'np',
          'od',
          'rn',
          'lpn',
          'er',
          'ii',
          'iii',
        ].includes(bare)
      ) {
        return w.toUpperCase();
      }
      if (['of', 'and', 'the', 'at', 'for', 'in'].includes(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function cleanProvider(s: string): string {
  return titleCase(
    s
      .replace(/\s*(?:#|store\s*#?|no\.?\s*)\s*\d{2,}\b/gi, '')
      .replace(/[|_~*=<>{}[\]]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s,.:;'"-]+|[\s,.:;'"-]+$/g, '')
      .trim(),
  ).slice(0, 80);
}

function letterRatio(s: string): number {
  const letters = (s.match(/[a-z]/gi) ?? []).length;
  return s.length ? letters / s.replace(/\s/g, '').length : 0;
}

const GENERIC_PROVIDER_WORD =
  /^(hospital|clinic|pharmacy|medical\s*center|health\s*center|laboratory|labs?|associates|medicine|dental|radiology)$/i;

function scoreProviderLine(raw: string, index: number, limit: number): number | null {
  if (raw.length < 3 || raw.length > 70) return null;
  const bare = raw.replace(/\s*(?:#|store\s*#?)\s*\d+/gi, '');
  if (letterRatio(bare) < 0.65) return null;
  if (ADDRESS_LINE.test(bare)) return null;
  const words = raw.split(/\s+/).length;
  let score = (limit - index) / limit; // earlier lines are likelier to be the letterhead
  if (PROVIDER_HINT.test(raw)) score += 3;
  if (NOT_PROVIDER.test(raw)) score -= 2.5;
  if (/^[A-Z0-9 &.,'-]+$/.test(raw) && /[A-Z]{3}/.test(raw)) score += 0.75;
  if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+/.test(raw)) score += 0.5;
  if (words === 1 && !PROVIDER_HINT.test(raw)) score -= 1;
  if (GENERIC_PROVIDER_WORD.test(raw.trim())) score -= 1.5;
  if (words >= 2 && words <= 7) score += 0.4;
  return score;
}

/**
 * Finds the provider's name. OCR often puts side-by-side header blocks on one line
 * ("MERCY GENERAL      STATEMENT") and wraps long names ("MERCY GENERAL" / "HOSPITAL"),
 * so lines are split on wide gaps and short follow-on lines are tried joined.
 */
export function detectProvider(lines: string[]): Detected<string> | null {
  // An explicit "make checks payable to" wins.
  for (let i = 0; i < lines.length; i++) {
    const m = (lines[i] ?? '').replace(/\s+/g, ' ').match(PAYABLE_TO);
    if (!m) continue;
    const rest = (m[2] ?? '').trim();
    const candidate = rest.length >= 3 ? rest : (lines[i + 1] ?? '').replace(/\s+/g, ' ').trim();
    if (candidate && letterRatio(candidate) > 0.6 && !ADDRESS_LINE.test(candidate)) {
      return { value: cleanProvider(candidate), confidence: 0.85, label: 'Payable to' };
    }
  }
  const head = lines.slice(0, 12).map((l) =>
    l
      .split(/\s{3,}|\t+/)
      .map((seg) => seg.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  );
  const limit = Math.max(1, head.length);
  let best: { value: string; score: number } | null = null;
  const consider = (value: string, index: number) => {
    const score = scoreProviderLine(value, index, limit);
    if (score !== null && (!best || score > best.score)) best = { value, score };
  };
  head.forEach((segments, i) => {
    segments.forEach((seg, j) => {
      consider(seg, i);
      // Join a wrapped name with the short line right under it.
      const nextSeg = j === 0 ? head[i + 1]?.[0] : undefined;
      if (
        nextSeg &&
        nextSeg.split(/\s+/).length <= 3 &&
        letterRatio(nextSeg) > 0.8 &&
        !NOT_PROVIDER.test(nextSeg)
      ) {
        const sameCase = (seg === seg.toUpperCase()) === (nextSeg === nextSeg.toUpperCase());
        if (sameCase && !PROVIDER_HINT.test(seg)) consider(`${seg} ${nextSeg}`, i);
      }
    });
  });
  const pick = best as { value: string; score: number } | null;
  if (!pick || pick.score < 0.4) return null;
  const confidence = pick.score >= 3 ? 0.8 : pick.score >= 1.2 ? 0.55 : 0.35;
  return { value: cleanProvider(pick.value), confidence };
}

export function detectServiceDate(
  lines: string[],
  today: ISODate,
): { best: Detected<ISODate> | null; candidates: DateCandidate[] } {
  const candidates: DateCandidate[] = [];
  const minYear = Number(today.slice(0, 4)) - 6;
  lines.forEach((line, i) => {
    const dates = findDates(line);
    dates.forEach((d, j) => {
      if (d.value > today) return; // care can't be in the future
      if (Number(d.value.slice(0, 4)) < minYear) return;
      const before = labelBefore(line, d.index);
      const prev = lines[i - 1] ?? '';
      let score = 0;
      let label: string | undefined;
      if (
        BIRTH_LABEL.test(before) ||
        (j === 0 && !before.trim() && BIRTH_LABEL.test(prev) && !SERVICE_LABEL.test(prev))
      ) {
        return;
      }
      if (SERVICE_LABEL.test(before)) {
        score += 4;
        label = before.match(SERVICE_LABEL)?.[0];
      } else if (NOT_SERVICE_LABEL.test(before)) {
        score -= 3;
        label = before.match(NOT_SERVICE_LABEL)?.[0];
      } else if (SERVICE_LABEL.test(prev) && !NOT_SERVICE_LABEL.test(prev)) {
        score += 2.5;
        label = prev.match(SERVICE_LABEL)?.[0];
      } else if (NOT_SERVICE_LABEL.test(prev) && !before.trim()) {
        score -= 1.5;
      }
      // Itemized lines: a date followed by a charge on the same line.
      if (findAmounts(line.slice(d.index)).length) score += 1;
      candidates.push({ value: d.value, score, label: label?.trim(), line: i });
    });
  });
  if (!candidates.length) return { best: null, candidates };
  const top = Math.max(...candidates.map((c) => c.score));
  const winners = candidates.filter((c) => c.score === top);
  // Among equals, the earliest service date (first visit on an itemized bill).
  const pick = winners.reduce((a, b) => (b.value < a.value ? b : a));
  const confidence = top >= 4 ? 0.9 : top >= 2.5 ? 0.75 : top >= 0 ? 0.45 : 0.2;
  const unique = new Map<string, DateCandidate>();
  for (const c of [...candidates].sort((a, b) => b.score - a.score)) {
    if (!unique.has(c.value)) unique.set(c.value, c);
  }
  return {
    best: { value: pick.value, confidence, label: pick.label },
    candidates: [...unique.values()],
  };
}

export function detectAmount(lines: string[]): {
  best: Detected<number> | null;
  candidates: AmountCandidate[];
} {
  const candidates: AmountCandidate[] = [];
  lines.forEach((line, i) => {
    const amounts = findAmounts(line);
    const prev = lines[i - 1] ?? '';
    for (const a of amounts) {
      const before = labelBefore(line, a.index);
      let score = 0;
      let label: string | undefined;
      const ctx = before.trim() ? before : prev;
      const near = before.trim() ? 1 : 0.6;
      if (NEGATIVE_AMOUNT_LABEL.test(ctx)) {
        score -= 3 * near;
        label = ctx.match(NEGATIVE_AMOUNT_LABEL)?.[0];
      } else if (DUE_LABEL.test(ctx)) {
        score += 5 * near;
        label = ctx.match(DUE_LABEL)?.[0];
      } else if (PAID_LABEL.test(ctx)) {
        score += 4 * near;
        label = ctx.match(PAID_LABEL)?.[0];
      } else if (TOTAL_LABEL.test(ctx)) {
        score += (/total\s*charges?/i.test(ctx) ? 1.5 : 3) * near;
        label = ctx.match(TOTAL_LABEL)?.[0];
      }
      if (/\$/.test(line.slice(a.index, a.index + 3))) score += 0.25;
      if (a.value === 0) score -= 2;
      candidates.push({ value: a.value, score, label: label?.trim(), line: i });
    }
  });
  if (!candidates.length) return { best: null, candidates };
  const top = Math.max(...candidates.map((c) => c.score));
  const winners = candidates.filter((c) => c.score === top);
  const pick = winners.reduce((a, b) => (b.value > a.value ? b : a));
  const confidence = top >= 4.5 ? 0.9 : top >= 3 ? 0.7 : top > 0 ? 0.5 : 0.3;
  const unique = new Map<number, AmountCandidate>();
  for (const c of [...candidates].sort((a, b) => b.score - a.score)) {
    if (!unique.has(c.value) && c.value > 0) unique.set(c.value, c);
  }
  return {
    best: { value: pick.value, confidence, label: pick.label },
    candidates: [...unique.values()].slice(0, 8),
  };
}

export function detectStatus(text: string, amount: Detected<number> | null): BillStatus | null {
  const paidSignals =
    /(paid\s*in\s*full|thank\s*you\s*for\s*your\s*payment|payment\s*received|amount\s*paid|\bapproved\b|\bvisa\b|mastercard|\bamex\b|discover|debit|\bcash\b|change\s*due|auth(?:orization)?\s*(?:code|#)|\breceipt\b)/i;
  const dueSignals =
    /((?:amount|balance|total)\s*(?:now\s*)?due|please\s*pay|pay\s*this\s*amount|due\s*date|remit|you\s*owe|detach\s*and\s*return|past\s*due)/i;
  const zeroDue = /(balance|amount)\s*due\s*:?\s*\$?\s*0\.00/i.test(text);
  if (zeroDue) return 'paid';
  const due = dueSignals.test(text);
  const paid = paidSignals.test(text);
  if (due && !paid) return 'unpaid';
  if (paid && !due) return 'paid';
  if (paid && due && amount?.label && PAID_LABEL.test(amount.label)) return 'paid';
  if (due) return 'unpaid';
  return null;
}

/** Category from the provider name first (most reliable), then from the whole bill. */
export function detectCategory(text: string, provider?: string): BillCategory | null {
  if (provider) for (const [cat, re] of CATEGORY_RULES) if (re.test(provider)) return cat;
  for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat;
  return null;
}

export function parseBillText(text: string, today: ISODate): ParsedBill {
  const raw = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.trim());
  const lines = raw.map((l) => l.replace(/\s+/g, ' ').trim());
  const provider = detectProvider(raw);
  const date = detectServiceDate(lines, today);
  const amount = detectAmount(lines);
  return {
    provider,
    serviceDate: date.best,
    amount: amount.best,
    status: detectStatus(text, amount.best),
    category: detectCategory(text, provider?.value),
    dates: date.candidates,
    amounts: amount.candidates,
  };
}
