import { signal } from '@preact/signals';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void } | undefined;
}

export const toasts = signal<Toast[]>([]);
let seq = 0;

export function toast(
  message: string,
  opts: { action?: Toast['action']; duration?: number } = {},
): void {
  const id = ++seq;
  toasts.value = [...toasts.value, { id, message, action: opts.action }];
  const duration = opts.duration ?? (opts.action ? 9000 : 3500);
  if (duration > 0) setTimeout(() => dismissToast(id), duration);
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}
