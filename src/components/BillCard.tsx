import { formatDate } from '../lib/dates';
import type { BillUsage } from '../lib/engine';
import { CATEGORY_LABELS } from '../lib/labels';
import { formatCents } from '../lib/money';
import { periodFor, periodLabel } from '../lib/periods';
import type { Bill, Settings } from '../lib/types';
import { Icon } from './Icon';
import { Thumb } from './Thumb';

interface Props {
  bill: Bill;
  usage?: BillUsage | undefined;
  settings: Pick<Settings, 'periodAnchor' | 'periodMonths'>;
  duplicate?: boolean;
}

export function BillCard({ bill, usage, settings, duplicate }: Props) {
  const sent = usage?.submittedIn ?? [];
  return (
    <a class="bill" href={`#/bills/${bill.id}`} data-testid="bill-card">
      <Thumb attachmentId={bill.attachmentIds[0]} />
      <div class="info">
        <div class="provider">{bill.provider || 'Unknown provider'}</div>
        <div class="meta">
          {formatDate(bill.serviceDate)} · {CATEGORY_LABELS[bill.category].split(' / ')[0]}
        </div>
        <div class="chips">
          {bill.status === 'paid' ? (
            <span class="chip ok">Paid</span>
          ) : (
            <span class="chip caution">Unpaid</span>
          )}
          {bill.medicaidProvider === 'no' && <span class="chip">Not Medicaid</span>}
          {bill.medicaidProvider === 'unknown' && <span class="chip info">Medicaid?</span>}
          {sent.length > 0 && (
            <span class="chip brand">
              <Icon name="send" />
              Sent{' '}
              {periodLabel(
                periodFor(sent[0]!, settings.periodAnchor, settings.periodMonths),
                'short',
              )}
            </span>
          )}
          {usage && usage.medicaidMayPayCents > 0 && <span class="chip ok">Medicaid may pay</span>}
          {duplicate && <span class="chip alert">Duplicate?</span>}
        </div>
      </div>
      <div class="amount">
        {formatCents(bill.amountCents)}
        {usage && usage.appliedCents > 0 && (
          <small>{formatCents(usage.appliedCents)} counted</small>
        )}
      </div>
    </a>
  );
}
