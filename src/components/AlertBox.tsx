import type { ComponentChildren } from 'preact';
import type { WarningLevel } from '../lib/warnings';
import { Icon } from './Icon';

interface Props {
  level: WarningLevel | 'ok';
  title: string;
  children?: ComponentChildren;
  action?: { label: string; href: string } | undefined;
}

const ICON: Record<string, string> = {
  info: 'info',
  caution: 'alert',
  alert: 'alert',
  ok: 'check-circle',
};

export function AlertBox({ level, title, children, action }: Props) {
  const cls = level === 'alert' ? 'alert-level' : level;
  return (
    <div class={`alert ${cls}`} role={level === 'alert' ? 'alert' : undefined}>
      <Icon name={ICON[level] ?? 'info'} />
      <div class="body">
        <strong>{title}</strong>
        {children && <p>{children}</p>}
        {action && (
          <a class="btn btn-sm btn-outline" href={action.href}>
            {action.label}
          </a>
        )}
      </div>
    </div>
  );
}
