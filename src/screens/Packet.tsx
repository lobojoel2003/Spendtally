import { useEffect, useMemo, useState } from 'preact/hooks';
import { AlertBox } from '../components/AlertBox';
import { TopBar, confirmDialog } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { getAttachment } from '../lib/db';
import { compareMonths, formatDate, formatDateUS, lastDayOfMonth } from '../lib/dates';
import { newId } from '../lib/id';
import { SOURCE_LABELS } from '../lib/labels';
import { formatCents } from '../lib/money';
import { makePeriod, nextPeriod, periodLabel, previousPeriod } from '../lib/periods';
import { navigate } from '../lib/router';
import { METHOD_LABELS } from '../lib/rules';
import {
  addSubmission,
  bills,
  ledger,
  removeSubmission,
  rules,
  settings,
  updateSettings,
} from '../lib/store';
import { toast } from '../lib/toast';
import type { Profile, Submission } from '../lib/types';
import { versionLabel } from '../lib/version';

const PROFILE_FIELDS: [keyof Profile, string, string?][] = [
  ['fullName', 'Your full name', 'name'],
  ['medicaidId', 'Medicaid ID / CIN'],
  ['caseNumber', 'Case number'],
  ['dateOfBirth', 'Date of birth'],
  ['phone', 'Phone', 'tel'],
  ['address', 'Address', 'street-address'],
  ['agencyName', 'Medicaid office'],
  ['agencyFax', 'Office fax number'],
  ['caseworker', 'Caseworker (optional)'],
];

export function Packet({ periodKey }: { periodKey?: string | undefined }) {
  const l = ledger.value;
  const s = settings.value;
  const r = rules.value;
  const key = periodKey ?? l.current.period.key;
  const result = l.byKey.get(key);
  const period = result?.period ?? makePeriod(key, s.periodMonths);
  const allBills = bills.value;
  const billMap = useMemo(() => new Map(allBills.map((b) => [b.id, b])), [allBills]);

  // Bills that count, plus other bills from this period the person may want to include.
  const counted = result?.entries ?? [];
  const countedIds = new Set(counted.map((e) => e.billId));
  const extra = (result?.billIds ?? []).filter((id) => !countedIds.has(id));
  const countedKey = counted.map((e) => e.billId).join(',');
  const [selected, setSelected] = useState<Set<string>>(new Set(countedIds));
  useEffect(() => setSelected(new Set(countedKey ? countedKey.split(',') : [])), [key, countedKey]);

  const [method, setMethod] = useState<string>(r.submission.methods[0] ?? 'mail');
  const [profile, setProfile] = useState<Profile>(s.profile);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);
  useEffect(() => {
    setPdfUrl(null);
    setPdfBlob(null);
  }, [key, selected, method]);

  const chosen = [...counted.map((e) => e.billId), ...extra].filter((id) => selected.has(id));
  const countedFor = (id: string) => counted.find((e) => e.billId === id)?.cents ?? 0;
  const totalCounted = chosen.reduce((sum, id) => sum + countedFor(id), 0);
  const totalBills = chosen.reduce((sum, id) => sum + (billMap.get(id)?.amountCents ?? 0), 0);
  const missing = (['fullName', 'medicaidId'] as const).filter((k) => !profile[k].trim());
  const filename = `spendtally-${period.key}${period.length > 1 ? `-${period.length}mo` : ''}.pdf`;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const saveProfile = async () => {
    await updateSettings({ profile });
  };

  const build = async () => {
    setBusy(true);
    try {
      await saveProfile();
      const { buildPacket } = await import('../lib/pdf/packet');
      const items = [];
      for (const id of chosen) {
        const bill = billMap.get(id);
        if (!bill) continue;
        const attachments = [];
        for (const aid of bill.attachmentIds) {
          const a = await getAttachment(aid);
          if (a)
            attachments.push({
              mime: a.mime,
              name: a.name,
              bytes: new Uint8Array(await a.blob.arrayBuffer()),
            });
        }
        items.push({ bill, countedCents: countedFor(id), attachments });
      }
      const bytes = await buildPacket({
        profile,
        state: r,
        periodLabel: periodLabel(period),
        periodRange: `${formatDateUS(`${period.start}-01`)} – ${formatDateUS(lastDayOfMonth(period.end))}`,
        targetCents: result?.targetCents ?? l.targetCents,
        bills: items,
        method,
        appVersion: versionLabel(),
      });
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      setPdfBlob(blob);
      setPdfUrl(URL.createObjectURL(blob));
      toast('Packet ready');
      requestAnimationFrame(() =>
        document.getElementById('packet-ready')?.scrollIntoView({ behavior: 'smooth' }),
      );
    } catch (e) {
      console.error(e);
      toast('Could not build the packet. Try removing a damaged photo.');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const share = async () => {
    if (!pdfBlob) return;
    const file = new File([pdfBlob], filename, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Spend-down bills — ${periodLabel(period)}`,
        });
      } catch {
        /* cancelled */
      }
    } else {
      download();
    }
  };

  const markSent = async () => {
    const ok = await confirmDialog({
      title: 'Mark this packet as sent?',
      body: `Spendtally will remember these ${chosen.length} bills were sent for ${periodLabel(period)} so they are never counted twice.`,
      confirm: 'Yes, I sent it',
    });
    if (!ok) return;
    const applied: Record<string, number> = {};
    for (const id of chosen) {
      const c = countedFor(id);
      if (c > 0) applied[id] = c;
    }
    const sub: Submission = {
      id: newId('sub'),
      periodKey: period.key,
      createdAt: new Date().toISOString(),
      applied,
      billIds: chosen,
      totalCents: totalBills,
      method,
    };
    await addSubmission(sub);
    toast(`Marked as sent for ${periodLabel(period)}`);
  };

  const undo = async (sub: Submission) => {
    const ok = await confirmDialog({
      title: 'Undo this submission?',
      body: 'The bills go back to being estimated. Do this only if the packet was never sent.',
      confirm: 'Undo',
      danger: true,
    });
    if (ok) await removeSubmission(sub.id);
  };

  const prev = previousPeriod(period);
  const next = nextPeriod(period);
  const canNext = compareMonths(next.start, l.current.period.start) <= 0;
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <>
      <TopBar title="Submission packet" />
      <main id="main" class="stack">
        <section class="card">
          <div class="period-switch">
            <button
              class="icon-btn"
              aria-label="Previous period"
              onClick={() => navigate(`/packet/${prev.key}`, { replace: true })}
            >
              <Icon name="chevron-left" />
            </button>
            <div class="label">
              <span class="muted small">Packet for</span>
              <strong>{periodLabel(period)}</strong>
            </div>
            <button
              class="icon-btn"
              aria-label="Next period"
              disabled={!canNext}
              onClick={() => navigate(`/packet/${next.key}`, { replace: true })}
            >
              <Icon name="chevron-right" />
            </button>
          </div>
          <dl class="totals" style={{ marginTop: '0.75rem' }}>
            <dt>Spend-down for this period</dt>
            <dd>{formatCents(result?.targetCents ?? l.targetCents)}</dd>
            <dt>Counted from selected bills</dt>
            <dd class="grand">{formatCents(totalCounted)}</dd>
            <dt>Total of selected bills</dt>
            <dd>{formatCents(totalBills)}</dd>
          </dl>
          {result?.met ? (
            <p class="met-badge" style={{ marginTop: '0.75rem' }}>
              <Icon name="check" /> Spend-down met
            </p>
          ) : (
            <p class="small muted" style={{ marginTop: '0.75rem' }}>
              Not met yet — {formatCents(result?.remainingCents ?? l.targetCents)} to go. You can
              still send what you have.
            </p>
          )}
        </section>

        {result?.submissions.map((sub) => (
          <AlertBox
            key={sub.id}
            level="ok"
            title={`Sent on ${formatDate(sub.createdAt.slice(0, 10))}`}
          >
            {sub.billIds.length} bills, {formatCents(sub.totalCents)} by{' '}
            {METHOD_LABELS[sub.method]?.toLowerCase() ?? sub.method}.{' '}
            <button class="btn btn-sm btn-ghost" onClick={() => undo(sub)}>
              <Icon name="undo" /> Undo
            </button>
          </AlertBox>
        ))}

        <section class="card" aria-labelledby="bills-title">
          <div class="card-title">
            <h2 id="bills-title">Bills to include</h2>
            <span class="chip">{chosen.length}</span>
          </div>
          {counted.length + extra.length === 0 && (
            <p class="muted">
              No bills for this period yet. <a href="#/add">Add a bill</a>
            </p>
          )}
          {[...counted.map((e) => e.billId), ...extra].map((id) => {
            const b = billMap.get(id);
            if (!b) return null;
            const c = countedFor(id);
            const entry = counted.find((e) => e.billId === id);
            return (
              <label class="check-row" key={id}>
                <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} />
                <span class="spacer" style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block' }}>{b.provider || 'Unknown provider'}</strong>
                  <span class="small muted">
                    {formatDate(b.serviceDate)} · {b.status === 'paid' ? 'Paid' : 'Unpaid'}
                    {entry &&
                      entry.source === 'carried' &&
                      ` · ${SOURCE_LABELS.carried.toLowerCase()}`}
                    {!b.attachmentIds.length && ' · no copy'}
                  </span>
                </span>
                <span class="num" style={{ textAlign: 'right', flex: 'none' }}>
                  <strong>{formatCents(b.amountCents)}</strong>
                  <span class="small muted" style={{ display: 'block' }}>
                    {c ? `${formatCents(c)} counts` : 'not needed'}
                  </span>
                </span>
              </label>
            );
          })}
        </section>

        <details class="disclosure" open={missing.length > 0}>
          <summary>
            Cover sheet details
            {missing.length > 0 && (
              <span class="chip caution" style={{ marginLeft: '0.5rem' }}>
                {missing.length} missing
              </span>
            )}
          </summary>
          <div class="stack-sm">
            {PROFILE_FIELDS.map(([k, label, auto]) => (
              <div class="field" key={k}>
                <label for={`p-${k}`}>{label}</label>
                <input
                  id={`p-${k}`}
                  class="input"
                  type={(k === 'dateOfBirth' ? 'date' : 'text') as 'text'}
                  autoComplete={auto ?? 'off'}
                  inputMode={k === 'agencyFax' || k === 'phone' ? 'tel' : undefined}
                  value={profile[k]}
                  placeholder={k === 'agencyName' ? r.agency : undefined}
                  onInput={(e) => setProfile({ ...profile, [k]: e.currentTarget.value })}
                  onBlur={saveProfile}
                />
              </div>
            ))}
          </div>
        </details>

        <section class="card stack-sm" aria-labelledby="send-title">
          <h2 id="send-title">How you'll send it</h2>
          <div class="chips" role="group" aria-label="Send method">
            {r.submission.methods.map((m) => (
              <button key={m} class="chip" aria-pressed={method === m} onClick={() => setMethod(m)}>
                {METHOD_LABELS[m] ?? m}
              </button>
            ))}
          </div>
          <p class="small muted">{r.submission.description}</p>
        </section>

        <button
          class="btn btn-primary btn-lg btn-block"
          disabled={busy || chosen.length === 0}
          onClick={build}
          data-testid="build-packet"
        >
          <Icon name="packet" />{' '}
          {busy ? 'Building…' : pdfUrl ? 'Rebuild packet' : 'Create packet PDF'}
        </button>

        {pdfUrl && (
          <section class="card stack" id="packet-ready" aria-labelledby="ready-title">
            <div class="card-title">
              <h2 id="ready-title">Your packet is ready</h2>
              <span class="chip ok">PDF</span>
            </div>
            <iframe class="pdf-frame" src={pdfUrl} title="Packet preview" />
            <div class="btn-row">
              <button class="btn btn-primary" onClick={download} data-testid="download-packet">
                <Icon name="download" /> Download
              </button>
              {canShare && (
                <button class="btn btn-outline" onClick={share}>
                  <Icon name="share" /> Share
                </button>
              )}
              <a class="btn btn-outline" href={pdfUrl} target="_blank" rel="noopener">
                <Icon name="print" /> Open to print
              </a>
            </div>
            <AlertBox level="info" title="After you send it">
              Tap “I sent it” so Spendtally locks these bills to {periodLabel(period)} and never
              counts them twice.
            </AlertBox>
            <button class="btn btn-outline btn-lg" onClick={markSent} data-testid="mark-sent">
              <Icon name="send" /> I sent it
            </button>
          </section>
        )}
      </main>
    </>
  );
}
