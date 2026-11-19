import { useEffect, useState } from 'preact/hooks';
import { formatCents } from '../lib/money';
import { Icon } from './Icon';

interface Props {
  appliedCents: number;
  targetCents: number;
  label: string;
}

const R = 88;
const C = 2 * Math.PI * R;

export function ProgressRing({ appliedCents, targetCents, label }: Props) {
  const pct = targetCents > 0 ? Math.min(1, appliedCents / targetCents) : 0;
  const met = targetCents > 0 && appliedCents >= targetCents;
  // Animate from empty on first paint.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return (
    <div
      class="ring-wrap"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={targetCents / 100}
      aria-valuenow={Math.min(appliedCents, targetCents) / 100}
      aria-label={`${label}: ${formatCents(appliedCents)} of ${formatCents(targetCents)} counted`}
    >
      <svg viewBox="0 0 200 200">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--ring-a)" />
            <stop offset="100%" stop-color="var(--ring-b)" />
          </linearGradient>
        </defs>
        <circle class="ring-track" cx="100" cy="100" r={R} fill="none" stroke-width="16" />
        <circle
          class="ring-value"
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke={met ? 'var(--ok)' : 'url(#ringGrad)'}
          stroke-width="16"
          stroke-linecap="round"
          stroke-dasharray={C}
          stroke-dashoffset={C * (1 - shown)}
          opacity={shown > 0 ? 1 : 0}
        />
      </svg>
      <div class="ring-center">
        <div class="ring-amount">{formatCents(appliedCents, { whole: true })}</div>
        <div class="ring-of">of {formatCents(targetCents, { whole: true })} counted</div>
        <div class="ring-pct">
          {met ? (
            <span class="met-badge">
              <Icon name="check" /> Met
            </span>
          ) : (
            <span class="chip brand">{Math.floor(pct * 100)}%</span>
          )}
        </div>
      </div>
    </div>
  );
}
