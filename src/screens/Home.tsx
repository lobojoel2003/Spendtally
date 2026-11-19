import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AlertBox } from '../components/AlertBox';
import { TopBar } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { ProgressRing } from '../components/ProgressRing';
import { compareMonths, monthKeyOf, monthShort } from '../lib/dates';
import { progressOf, type PeriodResult } from '../lib/engine';
import { SOURCE_LABELS } from '../lib/labels';
import { formatCents } from '../lib/money';
import { makePeriod, nextPeriod, periodLabel, previousPeriod } from '../lib/periods';
import { route, navigate } from '../lib/router';
import { bills, ledger, rules, settings, today } from '../lib/store';
import { periodAlerts } from '../lib/warnings';

function emptyResult(start: string, length: number, targetCents: number): PeriodResult {
  return {
    period: makePeriod(start, length),
    targetCents,
    appliedCents: 0,
    remainingCents: targetCents,
    met: false,
    submissions: [],
    entries: [],
    billIds: [],
    carriedInCents: 0,
    covered: [],
    excessPaidCents: 0,
    isCurrent: false,
  };
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 7) * 0.08}s`,
        color: ['#12796b', '#3fae7a', '#e0893a', '#24548f', '#f2c14e'][i % 5],
      })),
    [],
  );
  return (
    <div class="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={{ left: p.left, animationDelay: p.delay, background: p.color }} />
      ))}
    </div>
  );
}

export function Home() {
  const l = ledger.value;
  const s = settings.value;
  const r = rules.value;
  const allBills = bills.value;
  const billMap = useMemo(() => new Map(allBills.map((b) => [b.id, b])), [allBills]);
  const requested = route.value.query.get('period');
  const currentKey = l.current.period.key;
  const [key, setKey] = useState(requested ?? currentKey);
  useEffect(() => setKey(requested ?? currentKey), [currentKey, requested]);

  const result = l.byKey.get(key) ?? emptyResult(key, s.periodMonths, l.targetCents);
  const isCurrent = key === l.current.period.key;
  const prev = previousPeriod(result.period);
  const next = nextPeriod(result.period);
  const canNext = compareMonths(next.start, l.current.period.start) <= 0 || l.byKey.has(next.key);
  const alerts = isCurrent ? periodAlerts(l, bills.value, r) : [];

  // Celebrate the first time the current period is met in this session.
  const wasMet = useRef(result.met);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (result.met && !wasMet.current && isCurrent) setCelebrate(true);
    wasMet.current = result.met;
  }, [result.met, isCurrent]);

  const firstStart = l.periods[0]?.period.start ?? currentKey;
  // Month strip: months of a multi-month period, or recent periods for monthly programs.
  const strip: {
    key: string;
    label: string;
    sub: string;
    pct: number;
    met: boolean;
    current: boolean;
  }[] =
    result.period.length > 1
      ? result.period.months.map((m) => {
          const cents = result.entries
            .filter((e) => {
              const b = billMap.get(e.billId);
              return b && monthKeyOf(b.serviceDate) === m && e.source !== 'carried';
            })
            .reduce((sum, e) => sum + e.cents, 0);
          return {
            key: m,
            label: monthShort(m),
            sub: formatCents(cents, { whole: true }),
            pct: result.targetCents
              ? Math.min(1, (cents * result.period.length) / result.targetCents)
              : 0,
            met: false,
            current: m === monthKeyOf(today.value),
          };
        })
      : Array.from({ length: 6 }, (_, i) => {
          let p = result.period;
          for (let j = 0; j < 5 - i; j++) p = previousPeriod(p);
          return p;
        })
          .filter((p) => compareMonths(p.start, firstStart) >= 0 || p.key === result.period.key)
          .map((p) => {
            const res = l.byKey.get(p.key);
            return {
              key: p.key,
              label: monthShort(p.start),
              sub: res?.met ? 'Met' : res ? formatCents(res.appliedCents, { whole: true }) : '—',
              pct: res ? progressOf(res) : 0,
              met: !!res?.met,
              current: p.key === key,
            };
          });

  const hasBills = allBills.length > 0;
  const uncounted = result.billIds.filter((id) => !result.entries.some((e) => e.billId === id));

  return (
    <>
      <TopBar
        brand
        actions={
          <a class="icon-btn" href="#/help" aria-label="How spend-down works">
            <Icon name="help" />
          </a>
        }
      />
      <main id="main" class="stack">
        <section class="card ring-card" aria-labelledby="period-title">
          {celebrate && <Confetti />}
          <div class="period-switch">
            <button
              class="icon-btn"
              aria-label={`Previous period: ${periodLabel(prev)}`}
              onClick={() => navigate(`/?period=${prev.key}`, { replace: true })}
            >
              <Icon name="chevron-left" />
            </button>
            <div class="label">
              <span class="muted small">
                {isCurrent
                  ? 'This period'
                  : result.period.start < l.current.period.start
                    ? 'Past period'
                    : 'Upcoming'}
              </span>
              <strong id="period-title">{periodLabel(result.period)}</strong>
            </div>
            <button
              class="icon-btn"
              aria-label={`Next period: ${periodLabel(next)}`}
              disabled={!canNext}
              onClick={() => navigate(`/?period=${next.key}`, { replace: true })}
            >
              <Icon name="chevron-right" />
            </button>
          </div>

          <ProgressRing
            appliedCents={result.appliedCents}
            targetCents={result.targetCents}
            label={periodLabel(result.period)}
          />

          <p class={`ring-status${result.met ? ' met' : ''}`} data-testid="ring-status">
            {result.targetCents <= 0
              ? 'Add your spend-down amount in Settings.'
              : result.met
                ? result.submissions.length
                  ? 'Met and sent. Nice work!'
                  : `Spend-down met for ${periodLabel(result.period)}!`
                : `${formatCents(result.remainingCents)} to go`}
          </p>
          {result.carriedInCents > 0 && !result.met && (
            <p class="center small muted" style={{ marginTop: '0.2rem' }}>
              Includes unpaid bills carried over from earlier months.
            </p>
          )}

          <div
            class="months"
            style={{ '--cols': strip.length }}
            role="group"
            aria-label={result.period.length > 1 ? 'Months in this period' : 'Recent months'}
          >
            {strip.map((m) => (
              <button
                key={m.key}
                class={`month-bar${m.met ? ' met' : ''}`}
                aria-current={m.current ? 'true' : undefined}
                onClick={() =>
                  result.period.length === 1 && navigate(`/?period=${m.key}`, { replace: true })
                }
                aria-label={`${m.label}: ${m.sub}`}
              >
                <span class="bar">
                  <span class="fill" style={{ height: `${Math.round(m.pct * 100)}%` }} />
                </span>
                {m.label}
                <small>{m.sub}</small>
              </button>
            ))}
          </div>
        </section>

        <div class="btn-row">
          <a class="btn btn-primary btn-lg" href="#/add">
            <Icon name="camera" /> Scan a bill
          </a>
          {hasBills && (
            <a
              class={`btn btn-lg ${result.met ? 'btn-primary' : 'btn-outline'}`}
              href={`#/packet/${result.period.key}`}
            >
              <Icon name="packet" /> Build packet
            </a>
          )}
        </div>

        {alerts.length > 0 && (
          <section class="stack-sm" aria-label="Things to know">
            {alerts.map((a) => (
              <AlertBox key={a.id} level={a.level} title={a.title} action={a.action}>
                {a.detail}
              </AlertBox>
            ))}
          </section>
        )}

        {!hasBills ? (
          <div class="card empty">
            <div class="art">
              <Icon name="scan" />
            </div>
            <h2>Add your first bill</h2>
            <p class="muted" style={{ margin: '0.5rem 0 1.25rem' }}>
              Take a photo of a medical bill, pharmacy receipt or insurance premium notice. Old
              unpaid bills count too.
            </p>
            <a class="btn btn-primary" href="#/add">
              <Icon name="camera" /> Scan a bill
            </a>
          </div>
        ) : (
          <section class="card" aria-labelledby="counted-title">
            <div class="card-title">
              <h2 id="counted-title">Counted for {periodLabel(result.period, 'short')}</h2>
              <span class="chip brand num">{formatCents(result.appliedCents)}</span>
            </div>
            {result.entries.length === 0 && (
              <p class="muted">No bills count toward this period yet.</p>
            )}
            {result.entries.map((e) => {
              const b = billMap.get(e.billId);
              if (!b) return null;
              return (
                <a class="ledger-row" key={e.billId} href={`#/bills/${b.id}`}>
                  <div class="info">
                    <strong>{b.provider || 'Unknown provider'}</strong>
                    <span class="small muted">
                      {SOURCE_LABELS[e.source]}
                      {e.cents < b.amountCents &&
                        ` · ${formatCents(e.cents)} of ${formatCents(b.amountCents)}`}
                    </span>
                  </div>
                  <span class="num" style={{ fontWeight: 700 }}>
                    {formatCents(e.cents)}
                  </span>
                </a>
              );
            })}
            {uncounted.length > 0 && (
              <p class="small muted" style={{ marginTop: '0.75rem' }}>
                {uncounted.length} more bill{uncounted.length === 1 ? '' : 's'} from this period{' '}
                {uncounted.length === 1 ? "isn't" : "aren't"} needed
                {result.covered.length ? ' — Medicaid may pay them' : ''}.{' '}
                <a href="#/bills">See all bills</a>
              </p>
            )}
          </section>
        )}

        {r.notes.length > 0 && (
          <details class="disclosure">
            <summary>Tips for {r.name}</summary>
            <ul class="list-plain small">
              {r.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </>
  );
}
