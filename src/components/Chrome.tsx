import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { route } from '../lib/router';
import { dismissToast, toasts } from '../lib/toast';
import { Icon } from './Icon';

export function TopBar({
  title,
  back,
  actions,
  brand,
}: {
  title?: string;
  back?: (() => void) | undefined;
  actions?: ComponentChildren;
  brand?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header class={`topbar${scrolled ? ' scrolled' : ''}`}>
      <div class="topbar-inner">
        {back && (
          <button class="icon-btn" onClick={back} aria-label="Back">
            <Icon name="back" />
          </button>
        )}
        {brand ? (
          <a class="brand" href="#/">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={32} height={32} />
            Spendtally
          </a>
        ) : (
          <h1>{title}</h1>
        )}
        {actions}
      </div>
    </header>
  );
}

const TABS = [
  { name: 'home', href: '#/', label: 'Home', icon: 'home' },
  { name: 'bills', href: '#/bills', label: 'Bills', icon: 'list' },
  { name: 'add', href: '#/add', label: 'Scan', icon: 'camera', scan: true },
  { name: 'packet', href: '#/packet', label: 'Packet', icon: 'packet' },
  { name: 'settings', href: '#/settings', label: 'Settings', icon: 'settings' },
] as const;

export function TabBar() {
  const current = route.value.name;
  const active = current === 'bill' ? 'bills' : current === 'help' ? 'settings' : current;
  return (
    <nav class="tabbar" aria-label="Main">
      <div class="tabbar-inner">
        {TABS.map((t) =>
          'scan' in t ? (
            <a key={t.name} class="tab-scan" href={t.href} aria-label="Scan a bill">
              <Icon name={t.icon} />
            </a>
          ) : (
            <a
              key={t.name}
              class="tab"
              href={t.href}
              aria-current={active === t.name ? 'page' : undefined}
            >
              <Icon name={t.icon} />
              {t.label}
            </a>
          ),
        )}
      </div>
    </nav>
  );
}

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div class="toast" key={t.id}>
          <span class="spacer">{t.message}</span>
          {t.action && (
            <button
              class="btn"
              onClick={() => {
                t.action?.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Promise-based confirm dialog built on <dialog>. */
export function confirmDialog(opts: {
  title: string;
  body?: string;
  confirm: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.innerHTML = `
      <h2 style="margin-bottom:.5rem"></h2>
      <p class="muted" style="margin-bottom:1.25rem"></p>
      <div class="btn-row">
        <button class="btn btn-outline" value="cancel">Cancel</button>
        <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" value="ok"></button>
      </div>`;
    dialog.querySelector('h2')!.textContent = opts.title;
    dialog.querySelector('p')!.textContent = opts.body ?? '';
    dialog.querySelector('[value=ok]')!.textContent = opts.confirm;
    const done = (v: boolean) => {
      dialog.close();
      dialog.remove();
      resolve(v);
    };
    dialog.querySelector('[value=cancel]')!.addEventListener('click', () => done(false));
    dialog.querySelector('[value=ok]')!.addEventListener('click', () => done(true));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(false);
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}
