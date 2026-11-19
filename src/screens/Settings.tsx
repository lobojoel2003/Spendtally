import { useEffect, useRef, useState } from 'preact/hooks';
import { TopBar, confirmDialog } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { createBackup, readBackup, BackupError } from '../lib/backup';
import { listAttachments } from '../lib/db';
import { formatDate, isValidMonthKey } from '../lib/dates';
import { centsToInput, formatCents, parseMoney } from '../lib/money';
import { periodTargetCents } from '../lib/periods';
import { navigate } from '../lib/router';
import { OTHER_STATE, STATES, getStateRules } from '../lib/rules';
import {
  bills,
  resetEverything,
  restore,
  rules,
  settings,
  submissions,
  updateSettings,
} from '../lib/store';
import { toast } from '../lib/toast';
import type { Profile, TextSize, ThemePref } from '../lib/types';
import { BUILD, versionLabel } from '../lib/version';

function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function RestoreButton({ class: cls, label }: { class?: string; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = readBackup(JSON.parse(await file.text()));
      const ok = await confirmDialog({
        title: 'Restore this backup?',
        body: `It has ${data.bills.length} bills. Everything currently in Spendtally on this device will be replaced.`,
        confirm: 'Restore',
        danger: true,
      });
      if (!ok) return;
      await restore(data);
      toast('Backup restored');
      navigate('/', { replace: true });
    } catch (e) {
      toast(e instanceof BackupError ? e.message : 'That file could not be read.');
    } finally {
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="application/json,.json"
        class="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFile(e.currentTarget.files?.[0])}
      />
      <button class={cls ?? 'btn btn-outline'} onClick={() => ref.current?.click()}>
        <Icon name="upload" /> {label ?? 'Restore backup'}
      </button>
    </>
  );
}

const PROFILE_FIELDS: [keyof Profile, string][] = [
  ['fullName', 'Full name'],
  ['medicaidId', 'Medicaid ID / CIN'],
  ['caseNumber', 'Case number'],
  ['dateOfBirth', 'Date of birth'],
  ['phone', 'Phone'],
  ['address', 'Address'],
  ['agencyName', 'Medicaid office'],
  ['agencyFax', 'Office fax number'],
  ['caseworker', 'Caseworker'],
];

export function Settings() {
  const s = settings.value;
  const r = rules.value;
  const [amount, setAmount] = useState(centsToInput(s.spenddownCents));
  const [storage, setStorage] = useState<{
    usage: number;
    quota: number;
    persisted: boolean;
  } | null>(null);
  const [ocrState, setOcrState] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [ocrPct, setOcrPct] = useState(0);
  const billCount = bills.value.length;

  useEffect(() => {
    void (async () => {
      const est = await navigator.storage?.estimate?.();
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      if (est) setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0, persisted });
    })();
  }, [billCount]);

  const saveAmount = () => {
    const cents = parseMoney(amount);
    if (cents !== null && cents >= 0) void updateSettings({ spenddownCents: cents });
  };

  const changeState = (code: string) => {
    const next = getStateRules(code);
    const months = next.period.allowedMonths.includes(s.periodMonths)
      ? s.periodMonths
      : next.period.defaultMonths;
    void updateSettings({ stateCode: code, periodMonths: months });
  };

  const exportBackup = async () => {
    const file = await createBackup({
      settings: s,
      bills: bills.value,
      submissions: submissions.value,
      attachments: await listAttachments(),
      appVersion: BUILD.version,
    });
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spendtally-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Backup saved. Keep it somewhere safe — it holds your bills.');
  };

  const wipe = async () => {
    const ok = await confirmDialog({
      title: 'Delete everything?',
      body: 'All bills, photos and settings will be removed from this device. Make a backup first if you might need them.',
      confirm: 'Delete everything',
      danger: true,
    });
    if (!ok) return;
    await resetEverything();
    toast('All data deleted');
    navigate('/welcome', { replace: true });
  };

  const warmUp = async () => {
    setOcrState('loading');
    try {
      const { warmUpOcr } = await import('../lib/ocr/ocr');
      await warmUpOcr((p) => setOcrPct(p));
      setOcrState('ready');
      toast('Bill reader downloaded. Scanning now works offline.');
    } catch {
      setOcrState('idle');
      toast('Download failed. Check your connection and try again.');
    }
  };

  const target = periodTargetCents(s);

  return (
    <>
      <TopBar title="Settings" />
      <main id="main" class="stack">
        <section class="card stack" aria-labelledby="sd-title">
          <h2 id="sd-title">Your spend-down</h2>
          <div class="field">
            <label for="state">State</label>
            <select
              id="state"
              class="input"
              value={s.stateCode}
              onChange={(e) => changeState(e.currentTarget.value)}
            >
              {STATES.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.name}
                </option>
              ))}
              <option value={OTHER_STATE.code}>Another state</option>
            </select>
            <span class="hint">{r.programName}</span>
          </div>
          <div class="field">
            <label for="sd-amount">Amount on your notice</label>
            <div class="money-input">
              <input
                id="sd-amount"
                class="input"
                inputMode="decimal"
                value={amount}
                onInput={(e) => setAmount(e.currentTarget.value)}
                onBlur={saveAmount}
              />
            </div>
          </div>
          {s.periodMonths > 1 && (
            <div class="segmented">
              <button
                aria-pressed={s.amountBasis === 'month'}
                onClick={() => updateSettings({ amountBasis: 'month' })}
              >
                Per month
              </button>
              <button
                aria-pressed={s.amountBasis === 'period'}
                onClick={() => updateSettings({ amountBasis: 'period' })}
              >
                Whole period
              </button>
            </div>
          )}
          <div class="field">
            <span class="label">Period length</span>
            <div class="segmented">
              {(r.period.allowedMonths.includes(s.periodMonths)
                ? r.period.allowedMonths
                : [...r.period.allowedMonths, s.periodMonths].sort()
              ).map((m) => (
                <button
                  key={m}
                  aria-pressed={s.periodMonths === m}
                  onClick={() => updateSettings({ periodMonths: m })}
                >
                  {m} mo
                </button>
              ))}
            </div>
          </div>
          <div class="field">
            <label for="anchor">A period starts in</label>
            <input
              id="anchor"
              class="input"
              type="month"
              value={s.periodAnchor}
              onChange={(e) =>
                isValidMonthKey(e.currentTarget.value) &&
                updateSettings({ periodAnchor: e.currentTarget.value })
              }
            />
          </div>
          <p class="small muted">
            Each period needs <strong class="num">{formatCents(target)}</strong> in bills.
          </p>
        </section>

        <section class="card stack-sm" aria-labelledby="profile-title">
          <h2 id="profile-title">Cover sheet details</h2>
          <p class="small muted">
            Printed on your packet's cover sheet and at the top of every page.
          </p>
          {PROFILE_FIELDS.map(([k, label]) => (
            <div class="field" key={k}>
              <label for={`s-${k}`}>{label}</label>
              <input
                id={`s-${k}`}
                class="input"
                type={(k === 'dateOfBirth' ? 'date' : 'text') as 'text'}
                value={s.profile[k]}
                placeholder={k === 'agencyName' ? r.agency : undefined}
                onChange={(e) =>
                  updateSettings({ profile: { ...s.profile, [k]: e.currentTarget.value } })
                }
              />
            </div>
          ))}
        </section>

        <section class="card stack" aria-labelledby="display-title">
          <h2 id="display-title">Display</h2>
          <div class="field">
            <span class="label">Text size</span>
            <div class="segmented">
              {(
                [
                  ['normal', 'Standard'],
                  ['large', 'Large'],
                  ['xlarge', 'Largest'],
                ] as [TextSize, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  aria-pressed={s.textSize === v}
                  onClick={() => updateSettings({ textSize: v })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div class="field">
            <span class="label">Theme</span>
            <div class="segmented">
              {(
                [
                  ['system', 'Automatic'],
                  ['light', 'Light'],
                  ['dark', 'Dark'],
                ] as [ThemePref, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  aria-pressed={s.theme === v}
                  onClick={() => updateSettings({ theme: v })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section class="card stack-sm" aria-labelledby="data-title">
          <h2 id="data-title">Your data</h2>
          <p class="small muted">
            Spendtally keeps everything on this device only. Make a backup now and then, especially
            before changing phones.
          </p>
          {storage && (
            <dl class="kv">
              <dt>Bills</dt>
              <dd>{bills.value.length}</dd>
              <dt>Space used</dt>
              <dd>{bytes(storage.usage)}</dd>
              <dt>Protected from clean-up</dt>
              <dd>{storage.persisted ? 'Yes' : 'No'}</dd>
            </dl>
          )}
          <div class="btn-row" style={{ marginTop: '0.5rem' }}>
            <button class="btn btn-primary" onClick={exportBackup}>
              <Icon name="download" /> Save backup
            </button>
            <RestoreButton />
          </div>
          <button class="btn btn-outline" onClick={warmUp} disabled={ocrState !== 'idle'}>
            <Icon name="wifi_off" />
            {ocrState === 'idle' && 'Download bill reader for offline use'}
            {ocrState === 'loading' && `Downloading… ${Math.round(ocrPct * 100)}%`}
            {ocrState === 'ready' && 'Bill reader ready offline'}
          </button>
          <button class="btn btn-danger" onClick={wipe}>
            <Icon name="trash" /> Delete all data
          </button>
        </section>

        <section class="card stack-sm" aria-labelledby="about-title">
          <h2 id="about-title">About</h2>
          <dl class="kv">
            <dt>Version</dt>
            <dd data-testid="version">{versionLabel()}</dd>
            <dt>Commit</dt>
            <dd class="mono">{BUILD.commit}</dd>
            <dt>Built</dt>
            <dd>{formatDate(BUILD.date.slice(0, 10))}</dd>
            <dt>{r.name} rules reviewed</dt>
            <dd>
              {formatDate(r.lastReviewed)} ({r.confidence} confidence)
            </dd>
          </dl>
          <p class="small muted">
            Spendtally is free software under the GNU GPL v3. It is not legal advice and is not
            connected to any government agency. Your Medicaid office makes the final decision on
            every bill.
          </p>
          <div class="btn-row">
            <a class="btn btn-outline" href="#/help">
              <Icon name="help" /> How spend-down works
            </a>
            <a
              class="btn btn-outline"
              href="https://github.com/lobojoel2003/Spendtally"
              target="_blank"
              rel="noopener"
            >
              Source code
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
