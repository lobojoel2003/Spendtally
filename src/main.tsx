import { render } from 'preact';
import { App } from './app';
import { startRouter } from './lib/router';
import { loadAll, startClock } from './lib/store';
import { toast } from './lib/toast';
import './styles/global.css';

startRouter();
startClock();

loadAll()
  .catch((e) => {
    console.error(e);
    toast('Spendtally could not open its storage. Private browsing can block it.', { duration: 0 });
  })
  .finally(() => {
    const root = document.getElementById('app');
    if (root) {
      root.textContent = '';
      render(<App />, root);
    }
  });

// Offline support. In development the service worker is off.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh() {
        toast('A new version of Spendtally is ready.', {
          action: { label: 'Update', run: () => void update(true) },
          duration: 0,
        });
      },
      onOfflineReady() {
        toast('Spendtally now works offline.');
      },
    });
  });
}
