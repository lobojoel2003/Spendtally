import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AlertBox } from '../components/AlertBox';
import { TopBar, confirmDialog } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { getAttachment } from '../lib/db';
import { newBill } from '../lib/defaults';
import { formatDate, isValidISODate, monthKeyOf } from '../lib/dates';
import { newId } from '../lib/id';
import { isPdf, prepareImage } from '../lib/image';
import { CATEGORY_LABELS, SOURCE_LABELS } from '../lib/labels';
import { centsToInput, formatCents, parseMoney } from '../lib/money';
import type { ParsedBill } from '../lib/ocr/parse';
import { periodFor, periodLabel } from '../lib/periods';
import { goBack, navigate } from '../lib/router';
import {
  addAttachment,
  bills,
  duplicates,
  ledger,
  removeAttachment,
  removeBill,
  rules,
  saveBill,
  settings,
  today,
} from '../lib/store';
import { toast } from '../lib/toast';
import type { Attachment, Bill, BillCategory, TriState } from '../lib/types';
import { billWarnings } from '../lib/warnings';

interface DraftAttachment {
  id: string;
  mime: Attachment['mime'];
  name: string;
  blob: Blob;
  thumb?: Blob | undefined;
  width?: number | undefined;
  height?: number | undefined;
  url?: string | undefined;
  isNew: boolean;
}

type Mode = 'choose' | 'reading' | 'form';

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function BillScreen({ id }: { id?: string | undefined }) {
  const existing = id ? bills.value.find((b) => b.id === id) : undefined;
  if (id && !existing) {
    return (
      <>
        <TopBar title="Bill not found" back={() => navigate('/bills')} />
        <main class="no-nav">
          <p class="muted">This bill was deleted.</p>
        </main>
      </>
    );
  }
  return <BillEditor key={id ?? 'new'} existing={existing} />;
}

function BillEditor({ existing: existingProp }: { existing?: Bill | undefined }) {
  // Snapshot: edits elsewhere must not reset this form while it is open.
  const [existing] = useState(existingProp);
  const [draft, setDraft] = useState<Bill>(() => existing ?? newBill({ serviceDate: '' }));
  const [amount, setAmount] = useState(existing ? centsToInput(existing.amountCents) : '');
  const [mode, setMode] = useState<Mode>(existing ? 'form' : 'choose');
  const [atts, setAtts] = useState<DraftAttachment[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [parsed, setParsed] = useState<ParsedBill | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const detected = draft.ocr?.detected;
  const attsRef = useRef<DraftAttachment[]>([]);
  attsRef.current = atts;

  // Load saved attachments when editing.
  useEffect(() => {
    if (!existing) return;
    let alive = true;
    void Promise.all(existing.attachmentIds.map((a) => getAttachment(a))).then((list) => {
      if (!alive) return;
      setAtts(
        list
          .filter((a): a is Attachment => !!a)
          .map((a) => ({
            ...a,
            isNew: false,
            url: a.mime === 'application/pdf' ? undefined : URL.createObjectURL(a.thumb ?? a.blob),
          })),
      );
    });
    return () => {
      alive = false;
    };
  }, [existing]);

  useEffect(() => () => attsRef.current.forEach((a) => a.url && URL.revokeObjectURL(a.url)), []);

  const set = <K extends keyof Bill>(key: K, value: Bill[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /** Reuse what we know about a provider from earlier bills. */
  const rememberProvider = (name: string, base: Bill): Bill => {
    const prior = bills.value
      .filter((b) => b.id !== base.id && normalize(b.provider) === normalize(name) && name.trim())
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    if (!prior) return base;
    return {
      ...base,
      medicaidProvider:
        base.medicaidProvider === 'unknown' ? prior.medicaidProvider : base.medicaidProvider,
      category: prior.category,
    };
  };

  const runOcr = async (img: Awaited<ReturnType<typeof prepareImage>>) => {
    setMode('reading');
    setProgress(0);
    setStatus('Starting the reader');
    try {
      const [{ recognize }, { parseBillText }] = await Promise.all([
        import('../lib/ocr/ocr'),
        import('../lib/ocr/parse'),
      ]);
      const result = await recognize(img.ocrCanvas, (p, s) => {
        setProgress(p);
        setStatus(s);
      });
      const p = parseBillText(result.text, today.value);
      setParsed(p);
      setDraft((d) => {
        let next: Bill = {
          ...d,
          provider: d.provider || p.provider?.value || '',
          serviceDate: d.serviceDate || p.serviceDate?.value || '',
          status: p.status ?? d.status,
          category: p.category ?? d.category,
          ocr: {
            text: result.text,
            confidence: result.confidence,
            detected: { provider: !!p.provider, serviceDate: !!p.serviceDate, amount: !!p.amount },
          },
        };
        if (next.status === 'paid' && !next.paidDate && next.serviceDate)
          next.paidDate = next.serviceDate;
        next = rememberProvider(next.provider, next);
        return next;
      });
      if (p.amount) setAmount((a) => a || centsToInput(p.amount!.value));
      const found = [
        p.provider && 'provider',
        p.serviceDate && 'date',
        p.amount && 'amount',
      ].filter(Boolean);
      toast(
        found.length
          ? `Found the ${found.join(', ')}. Please check them.`
          : "Couldn't read this bill. Please type the details.",
      );
    } catch (e) {
      console.error(e);
      toast("The reader couldn't start. You can type the details instead.");
    } finally {
      setMode('form');
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let firstImage: Awaited<ReturnType<typeof prepareImage>> | null = null;
    const added: DraftAttachment[] = [];
    for (const file of Array.from(files)) {
      try {
        if (isPdf(file)) {
          added.push({
            id: newId('att'),
            mime: 'application/pdf',
            name: file.name || 'bill.pdf',
            blob: file,
            isNew: true,
          });
          continue;
        }
        const img = await prepareImage(file);
        added.push({
          id: newId('att'),
          mime: 'image/jpeg',
          name: file.name || 'photo.jpg',
          blob: img.blob,
          thumb: img.thumb,
          width: img.width,
          height: img.height,
          url: URL.createObjectURL(img.thumb),
          isNew: true,
        });
        if (!firstImage) firstImage = img;
      } catch (e) {
        console.error(e);
        toast(`Couldn't open ${file.name || 'that file'}. Try a JPEG, PNG or PDF.`);
      }
    }
    setAtts((a) => [...a, ...added]);
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
    if (firstImage && !draft.ocr) {
      await runOcr(firstImage);
    } else {
      if (added.some((a) => a.mime === 'application/pdf') && mode === 'choose') {
        toast('PDF attached. Please type the bill details.');
      }
      setMode('form');
    }
  };

  const cents = parseMoney(amount) ?? 0;
  const candidate: Bill = { ...draft, amountCents: cents, attachmentIds: atts.map((a) => a.id) };
  const usage = existing ? ledger.value.usage.get(existing.id) : undefined;
  const warnings = billWarnings(candidate, {
    settings: settings.value,
    rules: rules.value,
    usage,
    duplicates: existing ? duplicates.value : undefined,
    today: today.value,
  });
  const allBills = bills.value;
  const providers = useMemo(
    () => [...new Set(allBills.map((b) => b.provider).filter(Boolean))].sort(),
    [allBills],
  );

  const errors = {
    serviceDate: !isValidISODate(draft.serviceDate) ? 'Enter the date you got the care.' : '',
    amount: cents <= 0 ? 'Enter the amount you paid or still owe.' : '',
  };
  const valid = !errors.serviceDate && !errors.amount;

  const save = async () => {
    setTouched(true);
    if (!valid) {
      document.querySelector<HTMLElement>('.input.invalid')?.focus();
      return;
    }
    setSaving(true);
    try {
      for (const a of atts.filter((x) => x.isNew)) {
        await addAttachment({
          id: a.id,
          billId: draft.id,
          mime: a.mime,
          name: a.name,
          blob: a.blob,
          thumb: a.thumb,
          width: a.width,
          height: a.height,
          createdAt: new Date().toISOString(),
        });
      }
      for (const r of removed) await removeAttachment(r);
      const final: Bill = {
        ...candidate,
        provider: draft.provider.trim(),
        paidDate: draft.status === 'paid' ? draft.paidDate : undefined,
      };
      await saveBill(final);
      const p = periodFor(
        monthKeyOf(final.serviceDate),
        settings.value.periodAnchor,
        settings.value.periodMonths,
      );
      if (existing) {
        toast('Bill updated');
        goBack('#/bills');
      } else {
        toast(`Saved to ${periodLabel(p)}`, {
          action: { label: 'Add another', run: () => navigate('/add') },
        });
        navigate(`/?period=${p.key}`, { replace: true });
      }
    } catch (e) {
      console.error(e);
      toast('Could not save. Your device may be out of storage.');
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!existing) return;
    const sent = usage?.submittedIn.length;
    const ok = await confirmDialog({
      title: 'Delete this bill?',
      body: sent
        ? 'This bill was already sent in a packet. Deleting it removes it from Spendtally only.'
        : 'The bill and its photos will be removed from this device.',
      confirm: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await removeBill(existing.id);
    toast('Bill deleted');
    navigate('/bills', { replace: true });
  };

  const openAttachment = (a: DraftAttachment) => {
    const url = URL.createObjectURL(a.blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const removeAtt = (a: DraftAttachment) => {
    setAtts((list) => list.filter((x) => x.id !== a.id));
    if (!a.isNew) setRemoved((r) => [...r, a.id]);
    if (a.url) URL.revokeObjectURL(a.url);
  };

  const inputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        class="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="camera-input"
        onChange={(e) => onFiles(e.currentTarget.files)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        class="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="file-input"
        onChange={(e) => onFiles(e.currentTarget.files)}
      />
    </>
  );

  if (mode === 'choose') {
    return (
      <>
        <TopBar title="Add a bill" back={() => goBack('#/')} />
        <main id="main" class="stack">
          {inputs}
          <p class="muted">
            Take a clear photo of the whole page, on a flat surface with good light.
          </p>
          <div class="capture-grid">
            <button class="capture-option primary" onClick={() => cameraRef.current?.click()}>
              <span class="icon">
                <Icon name="camera" />
              </span>
              <span>
                <strong>Take a photo</strong>
                <span class="muted small">Spendtally reads it for you</span>
              </span>
            </button>
            <button class="capture-option" onClick={() => fileRef.current?.click()}>
              <span class="icon">
                <Icon name="upload" />
              </span>
              <span>
                <strong>Choose a file</strong>
                <span class="muted small">Photo or PDF from your device</span>
              </span>
            </button>
            <button
              class="capture-option"
              onClick={() => setMode('form')}
              data-testid="manual-entry"
            >
              <span class="icon">
                <Icon name="keyboard" />
              </span>
              <span>
                <strong>Type it in</strong>
                <span class="muted small">No photo handy</span>
              </span>
            </button>
          </div>
          <div class="alert ok">
            <Icon name="lock" />
            <div class="body">
              <strong>Read on your device</strong>
              <p>Photos are read right here on your phone or computer. They are never uploaded.</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (mode === 'reading') {
    const preview = atts.find((a) => a.url);
    return (
      <>
        <TopBar title="Reading your bill" />
        <main id="main" class="stack" aria-busy="true">
          <div class="preview">
            {preview?.url && <img src={preview.url} alt="Your bill" />}
            <div class="scan-line" />
          </div>
          <div class="stack-sm">
            <div class="row">
              <strong class="spacer">{status}…</strong>
              <span class="muted num">{Math.round(progress * 100)}%</span>
            </div>
            <div
              class="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </div>
            <p class="small muted">
              The first scan downloads the reader (about 7 MB). After that it works offline.
            </p>
          </div>
          <button class="btn btn-outline" onClick={() => setMode('form')}>
            Skip and type it in
          </button>
        </main>
      </>
    );
  }

  const dateChoices = (parsed?.dates ?? [])
    .filter((d) => d.value !== draft.serviceDate)
    .slice(0, 3);
  const amountChoices = (parsed?.amounts ?? []).filter((a) => a.value !== cents).slice(0, 4);

  return (
    <>
      <TopBar
        title={existing ? 'Edit bill' : 'Check the details'}
        back={() => goBack('#/bills')}
        actions={
          existing && (
            <button class="icon-btn" onClick={del} aria-label="Delete bill">
              <Icon name="trash" />
            </button>
          )
        }
      />
      <main id="main" class="stack">
        {inputs}
        <div class="pages" aria-label="Pages">
          {atts.map((a, i) => (
            <div class="page-thumb" key={a.id}>
              {a.url ? <img src={a.url} alt={`Page ${i + 1}`} /> : <Icon name="file" />}
              <button
                class="open"
                onClick={() => openAttachment(a)}
                aria-label={`Open page ${i + 1}`}
              />
              <button onClick={() => removeAtt(a)} aria-label={`Remove page ${i + 1}`}>
                <Icon name="x" />
              </button>
            </div>
          ))}
          <button class="page-thumb add" onClick={() => cameraRef.current?.click()}>
            <Icon name="camera" />
            Photo
          </button>
          <button class="page-thumb add" onClick={() => fileRef.current?.click()}>
            <Icon name="plus" />
            File
          </button>
        </div>

        {usage && (
          <div class="card flat" style={{ background: 'var(--brand-soft)' }}>
            <p class="small muted">How this bill is counted</p>
            {usage.perPeriod.length === 0 ? (
              <p>
                <strong>Not counted yet.</strong>{' '}
                {usage.closedReason === 'medicaid-paid'
                  ? 'Medicaid may pay it.'
                  : 'It is not needed so far.'}
              </p>
            ) : (
              <ul class="list-plain">
                {usage.perPeriod.map((p) => (
                  <li key={p.periodKey}>
                    <strong class="num">{formatCents(p.cents)}</strong> toward{' '}
                    {periodLabel(
                      periodFor(
                        p.periodKey,
                        settings.value.periodAnchor,
                        settings.value.periodMonths,
                      ),
                    )}{' '}
                    <span class="muted small">({SOURCE_LABELS[p.source]})</span>
                  </li>
                ))}
              </ul>
            )}
            {usage.availableCents > 0 && draft.status === 'unpaid' && (
              <p class="small" style={{ marginTop: '0.4rem' }}>
                {formatCents(usage.availableCents)} can still count in a later month.
              </p>
            )}
          </div>
        )}

        <div class="field">
          <label for="provider">
            Provider {detected?.provider && <span class="detected-tag">Found on bill</span>}
          </label>
          <input
            id="provider"
            class={`input${detected?.provider ? ' detected' : ''}`}
            list="providers"
            autoComplete="organization"
            placeholder="e.g. Mercy General Hospital"
            value={draft.provider}
            onInput={(e) => set('provider', e.currentTarget.value)}
            onBlur={(e) => setDraft((d) => rememberProvider(e.currentTarget.value, d))}
          />
          <datalist id="providers">
            {providers.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>

        <div class="field">
          <label for="serviceDate">
            Date of service{' '}
            {detected?.serviceDate && <span class="detected-tag">Found on bill</span>}
          </label>
          <input
            id="serviceDate"
            type="date"
            class={`input${detected?.serviceDate ? ' detected' : ''}${touched && errors.serviceDate ? ' invalid' : ''}`}
            value={draft.serviceDate}
            max={today.value}
            onInput={(e) => set('serviceDate', e.currentTarget.value)}
            aria-describedby="serviceDate-hint"
            aria-invalid={touched && !!errors.serviceDate}
          />
          <span class="hint" id="serviceDate-hint">
            {touched && errors.serviceDate ? (
              <span style={{ color: 'var(--alert)' }}>{errors.serviceDate}</span>
            ) : (
              'The day you got the care or picked up the medicine, not the statement date.'
            )}
          </span>
          {dateChoices.length > 0 && (
            <div class="suggestions">
              Other dates on the bill:
              {dateChoices.map((d) => (
                <button key={d.value} onClick={() => set('serviceDate', d.value)}>
                  {formatDate(d.value)}
                  {d.label ? ` (${d.label.toLowerCase()})` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <div class="field">
          <label for="amount">
            Amount you paid or owe{' '}
            {detected?.amount && <span class="detected-tag">Found on bill</span>}
          </label>
          <div class="money-input">
            <input
              id="amount"
              class={`input${detected?.amount ? ' detected' : ''}${touched && errors.amount ? ' invalid' : ''}`}
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onInput={(e) => setAmount(e.currentTarget.value)}
              aria-invalid={touched && !!errors.amount}
              aria-describedby="amount-hint"
            />
          </div>
          <span class="hint" id="amount-hint">
            {touched && errors.amount ? (
              <span style={{ color: 'var(--alert)' }}>{errors.amount}</span>
            ) : (
              'Your part after insurance (Medicare, supplement plans) has paid.'
            )}
          </span>
          {amountChoices.length > 0 && (
            <div class="suggestions">
              Other amounts:
              {amountChoices.map((a) => (
                <button key={a.value} onClick={() => setAmount(centsToInput(a.value))}>
                  {formatCents(a.value)}
                  {a.label ? ` (${a.label.toLowerCase()})` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <div class="field">
          <span class="label">Have you paid it?</span>
          <div class="segmented">
            <button
              aria-pressed={draft.status === 'unpaid'}
              onClick={() => set('status', 'unpaid')}
            >
              Not yet
            </button>
            <button
              aria-pressed={draft.status === 'paid'}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  status: 'paid',
                  paidDate: d.paidDate || d.serviceDate || today.value,
                }))
              }
            >
              Yes, paid
            </button>
          </div>
        </div>

        {draft.status === 'paid' && (
          <div class="field">
            <label for="paidDate">Date you paid</label>
            <input
              id="paidDate"
              type="date"
              class="input"
              value={draft.paidDate ?? ''}
              max={today.value}
              onInput={(e) => set('paidDate', e.currentTarget.value)}
            />
          </div>
        )}

        <div class="field">
          <span class="label">Does this provider take Medicaid?</span>
          <div class="segmented">
            {(
              [
                ['yes', 'Yes'],
                ['no', 'No'],
                ['unknown', 'Not sure'],
              ] as [TriState, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                aria-pressed={draft.medicaidProvider === v}
                onClick={() => set('medicaidProvider', v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div class="field">
          <label for="category">Type of care</label>
          <select
            id="category"
            class="input"
            value={draft.category}
            onChange={(e) => set('category', e.currentTarget.value as BillCategory)}
          >
            {Object.entries(CATEGORY_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div class="field">
          <label for="notes">Notes</label>
          <textarea
            id="notes"
            class="input"
            placeholder="Account number, what it was for, who you talked to…"
            value={draft.notes}
            onInput={(e) => set('notes', e.currentTarget.value)}
          />
        </div>

        {warnings.length > 0 && (
          <section class="stack-sm" aria-label="Things to know about this bill">
            {warnings.map((w) => (
              <AlertBox key={w.code} level={w.level} title={w.title}>
                {w.detail}
              </AlertBox>
            ))}
          </section>
        )}

        {draft.ocr?.text && (
          <details class="disclosure">
            <summary>Text read from the photo</summary>
            <pre class="ocr-text">{draft.ocr.text}</pre>
          </details>
        )}

        <div class="sticky-actions">
          <button
            class="btn btn-primary btn-lg btn-block"
            onClick={save}
            disabled={saving}
            data-testid="save-bill"
          >
            <Icon name="check" /> {existing ? 'Save changes' : 'Save bill'}
          </button>
        </div>
      </main>
    </>
  );
}
