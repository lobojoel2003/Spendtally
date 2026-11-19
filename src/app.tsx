import { useEffect } from 'preact/hooks';
import { TabBar, Toasts } from './components/Chrome';
import { route, navigate } from './lib/router';
import { ready, settings } from './lib/store';
import { BillScreen } from './screens/BillEditor';
import { Bills } from './screens/Bills';
import { Help } from './screens/Help';
import { Home } from './screens/Home';
import { Packet } from './screens/Packet';
import { Settings } from './screens/Settings';
import { Welcome } from './screens/Welcome';

function applyDisplay(theme: string, textSize: string) {
  const root = document.documentElement;
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.text = textSize;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0e1413' : '#f6f4ee');
  try {
    // Lets index.html apply the theme before the first paint next time.
    localStorage.setItem('spendtally:display', JSON.stringify({ theme, textSize }));
  } catch {
    /* storage may be unavailable */
  }
}

export function App() {
  const s = settings.value;
  const r = route.value;
  const isReady = ready.value;

  useEffect(() => {
    applyDisplay(s.theme, s.textSize);
    if (s.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyDisplay(s.theme, s.textSize);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [s.theme, s.textSize]);

  useEffect(() => {
    if (isReady && !s.onboarded && r.name !== 'welcome') navigate('/welcome', { replace: true });
    if (isReady && s.onboarded && r.name === 'welcome') navigate('/', { replace: true });
  }, [isReady, s.onboarded, r.name]);

  if (!isReady) return null;
  if (!s.onboarded || r.name === 'welcome') {
    return (
      <>
        <Welcome />
        <Toasts />
      </>
    );
  }

  let screen;
  switch (r.name) {
    case 'bills':
      screen = <Bills />;
      break;
    case 'bill':
      screen = <BillScreen id={r.params.id} />;
      break;
    case 'add':
      screen = <BillScreen />;
      break;
    case 'packet':
      screen = <Packet periodKey={r.params.period} />;
      break;
    case 'settings':
      screen = <Settings />;
      break;
    case 'help':
      screen = <Help />;
      break;
    default:
      screen = <Home />;
  }

  return (
    <div class="app">
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      {screen}
      <TabBar />
      <Toasts />
    </div>
  );
}
