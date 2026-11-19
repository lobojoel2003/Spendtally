import { signal } from '@preact/signals';

export interface Route {
  name: 'home' | 'bills' | 'bill' | 'add' | 'packet' | 'settings' | 'help' | 'welcome' | 'notfound';
  params: Record<string, string>;
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const query = new URLSearchParams(qs);
  const [first, second] = parts;
  switch (first) {
    case undefined:
      return { name: 'home', params: {}, query };
    case 'bills':
      return second
        ? { name: 'bill', params: { id: second }, query }
        : { name: 'bills', params: {}, query };
    case 'add':
      return { name: 'add', params: {}, query };
    case 'packet':
      return { name: 'packet', params: second ? { period: second } : {}, query };
    case 'settings':
      return { name: 'settings', params: {}, query };
    case 'help':
      return { name: 'help', params: {}, query };
    case 'welcome':
      return { name: 'welcome', params: {}, query };
    default:
      return { name: 'notfound', params: {}, query };
  }
}

export const route = signal<Route>(parseHash(typeof location !== 'undefined' ? location.hash : ''));

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const hash = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`;
  if (opts.replace) {
    history.replaceState(null, '', hash);
    route.value = parseHash(hash);
  } else if (location.hash === hash) {
    route.value = parseHash(hash);
  } else {
    location.hash = hash;
  }
}

/** Number of in-app navigations, so "Back" never leaves the app. */
let depth = 0;

export function goBack(fallback = '#/'): void {
  if (depth > 0) {
    depth -= 2; // the coming hashchange adds one back
    history.back();
  } else {
    navigate(fallback, { replace: true });
  }
}

export function startRouter(): () => void {
  const onChange = () => {
    depth = Math.max(0, depth + 1);
    route.value = parseHash(location.hash);
    window.scrollTo({ top: 0 });
  };
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}
