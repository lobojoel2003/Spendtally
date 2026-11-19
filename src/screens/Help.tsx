import { TopBar } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { formatDate } from '../lib/dates';
import { goBack } from '../lib/router';
import { METHOD_LABELS } from '../lib/rules';
import { rules } from '../lib/store';

function yesNo(
  v: boolean | null,
  yes: string,
  no: string,
  unknown = 'Not confirmed — ask your caseworker',
) {
  return v === true ? yes : v === false ? no : unknown;
}

export function Help() {
  const r = rules.value;
  const term = r.spenddownTerm;
  return (
    <>
      <TopBar title="How spend-down works" back={() => goBack('#/')} />
      <main id="main" class="stack">
        <section class="card stack-sm">
          <h2>The short version</h2>
          <p>
            If your income is a little over your state's Medicaid limit, you can still get Medicaid.
            Think of the difference as a <strong>deductible</strong>: once your medical bills for a
            period add up to it, Medicaid turns on for the rest of that period.
          </p>
        </section>

        <section class="card stack-sm">
          <h2>Rules that trip people up</h2>
          <div class="feature">
            <div class="icon">
              <Icon name="calendar" />
            </div>
            <div>
              <strong>Paid bills count in the month of service</strong>
              <p class="small muted">
                A bill you already paid counts only for the month you got the care, not the month
                you paid it (some states use the payment month instead). Spendtally files each bill
                in the right month for you.
              </p>
            </div>
          </div>
          <div class="feature">
            <div class="icon">
              <Icon name="alert" />
            </div>
            <div>
              <strong>Unpaid Medicaid-provider bills work for one month</strong>
              <p class="small muted">
                Once your spend-down is met, Medicaid pays the rest of a bill from a provider who
                takes Medicaid. So that bill can turn on coverage only once. Unpaid bills from
                providers who don't take Medicaid can keep counting while you still owe them.
              </p>
            </div>
          </div>
          <div class="feature">
            <div class="icon">
              <Icon name="info" />
            </div>
            <div>
              <strong>Your share is never covered</strong>
              <p class="small muted">
                The part of a bill used to meet the spend-down stays yours to pay. Medicaid only
                pays what is left over.
              </p>
            </div>
          </div>
          <div class="feature">
            <div class="icon">
              <Icon name="check-circle" />
            </div>
            <div>
              <strong>Each bill counts once</strong>
              <p class="small muted">
                After you send a packet, tap “I sent it”. Spendtally locks those bills to that
                period so they are never counted twice.
              </p>
            </div>
          </div>
          <div class="feature">
            <div class="icon">
              <Icon name="file" />
            </div>
            <div>
              <strong>Almost every medical cost counts</strong>
              <p class="small muted">
                Doctor and hospital bills, prescriptions, dental, eyeglasses, medical transport,
                equipment and health insurance premiums (like Medicare Part B) usually count — even
                from providers who don't take Medicaid.
              </p>
            </div>
          </div>
        </section>

        <section class="card stack-sm" aria-labelledby="state-title">
          <h2 id="state-title">{r.name}</h2>
          <p class="muted small">{r.programName}</p>
          <dl class="kv">
            <dt>Called</dt>
            <dd>{term}</dd>
            <dt>Period</dt>
            <dd>
              {r.period.allowedMonths.map((m) => `${m} month${m === 1 ? '' : 's'}`).join(' or ')}
            </dd>
            <dt>Send bills by</dt>
            <dd>{r.submission.methods.map((m) => METHOD_LABELS[m] ?? m).join(', ')}</dd>
            <dt>Pay-in option</dt>
            <dd>{yesNo(r.submission.payIn, 'Yes', 'No', 'Not confirmed')}</dd>
            <dt>Old unpaid bills carry over</dt>
            <dd>{yesNo(r.rules.unpaidBillsCarryForward, 'Yes', 'No', 'Not confirmed')}</dd>
            <dt>Premiums count</dt>
            <dd>{yesNo(r.rules.premiumsCount, 'Yes', 'No', 'Not confirmed')}</dd>
            <dt>Retroactive months</dt>
            <dd>{r.rules.retroactiveMonths ?? 'Not confirmed'}</dd>
          </dl>
          <p class="small">{r.period.description}</p>
          <p class="small">{r.submission.description}</p>
          {r.notes.length > 0 && (
            <ul class="list-plain small">
              {r.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <p class="tiny muted">
            Reviewed {formatDate(r.lastReviewed)} · {r.confidence} confidence. Rules change. Always
            confirm with your caseworker.
          </p>
          <details class="disclosure">
            <summary>Sources</summary>
            <ul class="list-plain small">
              {r.sources.map((src) => (
                <li key={src.url}>
                  <a href={src.url} target="_blank" rel="noopener noreferrer">
                    {src.title}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </section>

        <section class="card stack-sm">
          <h2>Coming in 2027</h2>
          <p class="small">
            A 2025 federal law shortens retroactive Medicaid coverage. For applications made from
            January 1, 2027, people who are 65 or older, blind or disabled can get up to two months
            of past bills covered instead of three. Ask your caseworker how this affects you.
          </p>
          <a
            class="small"
            href="https://justiceinaging.org/hr1-reduces-medicaid-retroactive-eligibility-starting-in-2027/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Justice in Aging: H.R. 1 reduces Medicaid retroactive eligibility
          </a>
        </section>

        <p class="small muted center">
          Spendtally gives estimates, not legal advice. For free help, contact your local legal aid
          office or your State Health Insurance Assistance Program (SHIP).
        </p>
      </main>
    </>
  );
}
