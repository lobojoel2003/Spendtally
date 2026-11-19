import { useMemo, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { addMonths, isValidMonthKey, monthKeyOf, monthName } from '../lib/dates';
import { centsToInput, formatCents, parseMoney } from '../lib/money';
import { periodFor, periodLabel, periodTargetCents } from '../lib/periods';
import { OTHER_STATE, STATES, getStateRules } from '../lib/rules';
import { settings, today, updateSettings } from '../lib/store';
import type { AmountBasis } from '../lib/types';
import { RestoreButton } from './Settings';

export function Welcome() {
  const s = settings.value;
  const [step, setStep] = useState(0);
  const [stateCode, setStateCode] = useState(s.stateCode);
  const [filter, setFilter] = useState('');
  const [amount, setAmount] = useState(centsToInput(s.spenddownCents));
  const [basis, setBasis] = useState<AmountBasis>(s.amountBasis);
  const [months, setMonths] = useState(s.periodMonths);
  const [anchor, setAnchor] = useState(s.periodAnchor || monthKeyOf(today.value));
  const [income, setIncome] = useState('');
  const [limit, setLimit] = useState('');

  const rules = getStateRules(stateCode);
  const list = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return STATES.filter(
      (st) => !q || st.name.toLowerCase().includes(q) || st.code.toLowerCase() === q,
    );
  }, [filter]);

  const chooseState = (code: string) => {
    setStateCode(code);
    const r = getStateRules(code);
    setMonths(r.period.defaultMonths);
  };

  const cents = parseMoney(amount) ?? 0;
  const calc = (() => {
    const i = parseMoney(income);
    const l = parseMoney(limit);
    return i !== null && l !== null ? Math.max(0, i - l) : null;
  })();

  const finish = async () => {
    await updateSettings({
      onboarded: true,
      stateCode,
      spenddownCents: cents,
      amountBasis: months > 1 ? basis : 'month',
      periodMonths: months,
      periodAnchor: isValidMonthKey(anchor) ? anchor : monthKeyOf(today.value),
    });
    // Ask the browser to keep this data even when storage runs low.
    void navigator.storage?.persist?.().catch(() => undefined);
    // No navigate() here: once `onboarded` flips, <App> leaves the welcome route itself.
    // Navigating after the await could yank the person off a screen they already opened.
  };

  const target = periodTargetCents({
    spenddownCents: cents,
    amountBasis: basis,
    periodMonths: months,
  });
  const current = periodFor(
    monthKeyOf(today.value),
    isValidMonthKey(anchor) ? anchor : monthKeyOf(today.value),
    months,
  );

  return (
    <div class="welcome" id="main">
      {step > 0 && (
        <div class="row">
          <button class="icon-btn" onClick={() => setStep(step - 1)} aria-label="Back">
            <Icon name="back" />
          </button>
          <div class="steps spacer" aria-label={`Step ${step} of 3`}>
            {[1, 2, 3].map((n) => (
              <span key={n} class={n <= step ? 'on' : ''} />
            ))}
          </div>
          <span style={{ width: '3rem' }} />
        </div>
      )}

      {step === 0 && (
        <>
          <div class="hero">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={96} height={96} />
            <h1>Spendtally</h1>
            <p class="lead">
              Keep track of your medical bills and see when your Medicaid spend-down is met.
            </p>
          </div>
          <div class="card stack">
            <div class="feature">
              <div class="icon">
                <Icon name="camera" />
              </div>
              <div>
                <strong>Snap each bill</strong>
                <p class="muted small">
                  Spendtally reads the date of service, provider and amount for you.
                </p>
              </div>
            </div>
            <div class="feature">
              <div class="icon">
                <Icon name="ring" />
              </div>
              <div>
                <strong>See your progress</strong>
                <p class="muted small">
                  Bills go into the right month, and a ring shows how close you are.
                </p>
              </div>
            </div>
            <div class="feature">
              <div class="icon">
                <Icon name="packet" />
              </div>
              <div>
                <strong>Send a ready-made packet</strong>
                <p class="muted small">
                  A cover sheet, a bill list with totals, and copies, ready to fax or upload.
                </p>
              </div>
            </div>
            <div class="feature">
              <div class="icon">
                <Icon name="lock" />
              </div>
              <div>
                <strong>Private by design</strong>
                <p class="muted small">Everything stays on this device. No account, no tracking.</p>
              </div>
            </div>
          </div>
          <div class="spacer" />
          <button class="btn btn-primary btn-lg btn-block" onClick={() => setStep(1)}>
            Get started
          </button>
          <RestoreButton class="btn btn-ghost btn-block" label="Restore from a backup" />
        </>
      )}

      {step === 1 && (
        <>
          <div>
            <h1>Where do you live?</h1>
            <p class="muted" style={{ marginTop: '0.4rem' }}>
              Each state runs its spend-down a little differently.
            </p>
          </div>
          <input
            class="input"
            type="search"
            placeholder="Search states"
            aria-label="Search states"
            value={filter}
            onInput={(e) => setFilter(e.currentTarget.value)}
          />
          <div class="state-list" role="group" aria-label="States">
            {list.map((st) => (
              <button
                key={st.code}
                class="state-option"
                aria-pressed={stateCode === st.code}
                onClick={() => chooseState(st.code)}
              >
                <span class="code">{st.code}</span>
                <span class="spacer">
                  <strong>{st.name}</strong>
                  <span class="muted small" style={{ display: 'block' }}>
                    {st.programName}
                  </span>
                </span>
              </button>
            ))}
            <button
              class="state-option"
              aria-pressed={stateCode === OTHER_STATE.code}
              onClick={() => chooseState(OTHER_STATE.code)}
            >
              <span class="code">?</span>
              <span class="spacer">
                <strong>My state isn't listed</strong>
                <span class="muted small" style={{ display: 'block' }}>
                  Set up the rules yourself
                </span>
              </span>
            </button>
          </div>
          {stateCode && (
            <div class="alert">
              <Icon name="info" />
              <div class="body">
                <strong>{rules.programName}</strong>
                <p>{rules.period.description}</p>
              </div>
            </div>
          )}
          <button
            class="btn btn-primary btn-lg btn-block"
            disabled={!stateCode}
            onClick={() => setStep(2)}
          >
            Continue
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div>
            <h1>What is your {rules.spenddownTerm}?</h1>
            <p class="muted" style={{ marginTop: '0.4rem' }}>
              Find it on your Medicaid notice. It may be called excess income, share of cost,
              spend-down or deductible.
            </p>
          </div>
          <div class="field">
            <label for="amount">Amount on your notice</label>
            <div class="money-input">
              <input
                id="amount"
                class="input input-big"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onInput={(e) => setAmount(e.currentTarget.value)}
              />
            </div>
          </div>
          {rules.period.allowedMonths.some((m) => m > 1) && (
            <div class="field">
              <span class="label">This amount is</span>
              <div class="segmented">
                <button aria-pressed={basis === 'month'} onClick={() => setBasis('month')}>
                  Per month
                </button>
                <button aria-pressed={basis === 'period'} onClick={() => setBasis('period')}>
                  For the whole period
                </button>
              </div>
            </div>
          )}
          <details class="disclosure">
            <summary>I don't know my amount</summary>
            <div class="stack-sm">
              <p class="small muted">
                Your spend-down is your monthly income minus your state's Medicaid income limit
                (both are on your notice). This is only a rough guide. Your notice is what counts.
              </p>
              <div class="row">
                <div class="field spacer">
                  <label for="income">Monthly income</label>
                  <div class="money-input">
                    <input
                      id="income"
                      class="input"
                      inputMode="decimal"
                      value={income}
                      onInput={(e) => setIncome(e.currentTarget.value)}
                    />
                  </div>
                </div>
                <div class="field spacer">
                  <label for="limit">Income limit</label>
                  <div class="money-input">
                    <input
                      id="limit"
                      class="input"
                      inputMode="decimal"
                      value={limit}
                      onInput={(e) => setLimit(e.currentTarget.value)}
                    />
                  </div>
                </div>
              </div>
              {calc !== null && (
                <button class="btn btn-outline" onClick={() => setAmount(centsToInput(calc))}>
                  Use {formatCents(calc)} per month
                </button>
              )}
            </div>
          </details>
          <div class="spacer" />
          <button
            class="btn btn-primary btn-lg btn-block"
            disabled={cents <= 0}
            onClick={() => setStep(3)}
          >
            Continue
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <div>
            <h1>Your spend-down period</h1>
            <p class="muted" style={{ marginTop: '0.4rem' }}>
              {rules.period.description}
            </p>
          </div>
          <div class="field">
            <span class="label">Each period lasts</span>
            <div class="segmented">
              {rules.period.allowedMonths.map((m) => (
                <button key={m} aria-pressed={months === m} onClick={() => setMonths(m)}>
                  {m} {m === 1 ? 'month' : 'months'}
                </button>
              ))}
            </div>
          </div>
          <div class="field">
            <label for="anchor">
              {months === 1 ? 'Start tracking from' : 'A period starts in'}
            </label>
            <input
              id="anchor"
              class="input"
              type="month"
              value={anchor}
              max={addMonths(monthKeyOf(today.value), 6)}
              onInput={(e) => setAnchor(e.currentTarget.value)}
            />
            <span class="hint">
              {months === 1
                ? 'Usually this month, or the first month you have bills for.'
                : 'Use the start month printed on your notice.'}
            </span>
          </div>
          <div class="card flat" style={{ background: 'var(--brand-soft)' }}>
            <p class="small muted">Your current period</p>
            <h2 style={{ margin: '0.2rem 0' }}>{periodLabel(current)}</h2>
            <p>
              Bills needed: <strong class="num">{formatCents(target)}</strong>
              {months > 1 && basis === 'month' && (
                <span class="muted small">
                  {' '}
                  ({formatCents(cents)} × {months} months)
                </span>
              )}
            </p>
            {months > 1 && (
              <p class="small muted" style={{ marginTop: '0.3rem' }}>
                Runs {monthName(current.start)} to {monthName(current.end)}.
              </p>
            )}
          </div>
          <div class="spacer" />
          <button class="btn btn-primary btn-lg btn-block" onClick={finish}>
            Start tracking
          </button>
        </>
      )}
    </div>
  );
}
