import { useMemo, useState } from 'preact/hooks';
import { BillCard } from '../components/BillCard';
import { TopBar } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { monthKeyOf, monthName } from '../lib/dates';
import { formatCents } from '../lib/money';
import { bills, duplicates, ledger, settings } from '../lib/store';
import type { Bill } from '../lib/types';

type Filter = 'all' | 'unpaid' | 'paid' | 'check' | 'not-sent';

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['unpaid', 'Unpaid'],
  ['paid', 'Paid'],
  ['check', 'Needs a check'],
  ['not-sent', 'Not sent'],
];

export function Bills() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const l = ledger.value;
  const dupes = duplicates.value;
  const allBills = bills.value;

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return allBills
      .filter((b) => {
        if (query && !`${b.provider} ${b.notes}`.toLowerCase().includes(query)) return false;
        const u = l.usage.get(b.id);
        switch (filter) {
          case 'unpaid':
            return b.status === 'unpaid';
          case 'paid':
            return b.status === 'paid';
          case 'check':
            return (
              b.medicaidProvider === 'unknown' ||
              !b.attachmentIds.length ||
              dupes.has(b.id) ||
              !b.serviceDate
            );
          case 'not-sent':
            return !u?.submittedIn.length;
          default:
            return true;
        }
      })
      .sort((a, b) => (a.serviceDate < b.serviceDate ? 1 : a.serviceDate > b.serviceDate ? -1 : 0));
  }, [allBills, q, filter, l, dupes]);

  const groups = useMemo(() => {
    const map = new Map<string, Bill[]>();
    for (const b of visible) {
      const k = b.serviceDate ? monthKeyOf(b.serviceDate) : 'none';
      map.set(k, [...(map.get(k) ?? []), b]);
    }
    return [...map.entries()];
  }, [visible]);

  const total = visible.reduce((s, b) => s + b.amountCents, 0);

  return (
    <>
      <TopBar
        title="Bills"
        actions={
          <a class="icon-btn" href="#/add" aria-label="Add a bill">
            <Icon name="plus" />
          </a>
        }
      />
      <main id="main" class="stack">
        {bills.value.length > 0 && (
          <>
            <input
              class="input"
              type="search"
              placeholder="Search providers and notes"
              aria-label="Search bills"
              value={q}
              onInput={(e) => setQ(e.currentTarget.value)}
            />
            <div class="chips" role="group" aria-label="Filter bills">
              {FILTERS.map(([f, label]) => (
                <button
                  key={f}
                  class="chip"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p class="small muted">
              {visible.length} bill{visible.length === 1 ? '' : 's'} ·{' '}
              <span class="num">{formatCents(total)}</span>
            </p>
          </>
        )}

        {bills.value.length === 0 && (
          <div class="card empty">
            <div class="art">
              <Icon name="list" />
            </div>
            <h2>No bills yet</h2>
            <p class="muted" style={{ margin: '0.5rem 0 1.25rem' }}>
              Bills you add show up here, sorted by the month you got the care.
            </p>
            <a class="btn btn-primary" href="#/add">
              <Icon name="camera" /> Add a bill
            </a>
          </div>
        )}

        {bills.value.length > 0 && visible.length === 0 && (
          <p class="muted center">No bills match.</p>
        )}

        {groups.map(([month, list]) => (
          <section key={month} aria-label={month === 'none' ? 'No date' : monthName(month)}>
            <div class="month-head">
              <h2>{month === 'none' ? 'No date yet' : monthName(month)}</h2>
              <span>{formatCents(list.reduce((s, b) => s + b.amountCents, 0))}</span>
            </div>
            <div class="bill-list">
              {list.map((b) => (
                <BillCard
                  key={b.id}
                  bill={b}
                  usage={l.usage.get(b.id)}
                  settings={settings.value}
                  duplicate={dupes.has(b.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
