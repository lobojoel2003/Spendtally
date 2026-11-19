#!/usr/bin/env node
/**
 * Regenerates the README screenshots in docs/images from a production build.
 *
 *   npm run build && npm run screenshots
 *
 * Loads a demo backup (fictional people and providers), then drives the app with Playwright.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'images');
const fixtures = join(root, 'tests', 'fixtures');
const work = join(tmpdir(), `spendtally-shots-${process.pid}`);
mkdirSync(out, { recursive: true });
mkdirSync(work, { recursive: true });

const PORT = 4180;
const NOW = new Date('2026-11-19T10:30:00');
const BASE = `http://localhost:${PORT}/`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

const browser = await chromium.launch();

/** Renders a fixture bill to a JPEG photo plus a thumbnail, like the app stores them. */
async function photo(name) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(pathToFileURL(join(fixtures, `${name}.html`)).href);
  const el = page.locator('.page');
  const full = await el.screenshot({ type: 'jpeg', quality: 80 });
  await page.close();
  const small = await browser.newPage({
    viewport: { width: 1000, height: 800 },
    deviceScaleFactor: 0.25,
  });
  await small.goto(pathToFileURL(join(fixtures, `${name}.html`)).href);
  const thumb = await small.locator('.page').screenshot({ type: 'jpeg', quality: 70 });
  await small.close();
  return { data: full.toString('base64'), thumbData: thumb.toString('base64') };
}

function bill(id, p) {
  return {
    id,
    notes: '',
    attachmentIds: [],
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
    ...p,
  };
}

async function demoBackup() {
  const mercy = await photo('sample-bill');
  const pharmacy = await photo('pharmacy-receipt');
  const eye = await photo('eye-care-receipt');
  const bills = [
    bill('northgate', {
      provider: 'Northgate Regional Hospital',
      serviceDate: '2026-07-15',
      amountCents: 124000,
      status: 'unpaid',
      medicaidProvider: 'no',
      category: 'hospital',
      notes: 'Old ER bill, still owed',
    }),
    bill('cardio', {
      provider: 'Hudson Valley Cardiology',
      serviceDate: '2026-10-16',
      amountCents: 28000,
      status: 'unpaid',
      medicaidProvider: 'no',
      category: 'doctor',
    }),
    bill('pharm-oct', {
      provider: 'Hudson Pharmacy',
      serviceDate: '2026-10-03',
      amountCents: 1250,
      status: 'paid',
      paidDate: '2026-10-03',
      medicaidProvider: 'yes',
      category: 'pharmacy',
    }),
    bill('mercy', {
      provider: 'Mercy General Hospital',
      serviceDate: '2026-10-28',
      amountCents: 39128,
      status: 'unpaid',
      medicaidProvider: 'yes',
      category: 'hospital',
      attachmentIds: ['att-mercy'],
    }),
    bill('premium', {
      provider: 'Medicare Part B premium',
      serviceDate: '2026-11-01',
      amountCents: 20290,
      status: 'paid',
      paidDate: '2026-11-01',
      medicaidProvider: 'yes',
      category: 'premium',
    }),
    bill('pharm-nov', {
      provider: 'Hudson Pharmacy',
      serviceDate: '2026-11-03',
      amountCents: 1250,
      status: 'paid',
      paidDate: '2026-11-03',
      medicaidProvider: 'yes',
      category: 'pharmacy',
      attachmentIds: ['att-pharm'],
    }),
    bill('eye', {
      provider: 'Capital Eye Care Associates',
      serviceDate: '2026-11-06',
      amountCents: 18500,
      status: 'paid',
      paidDate: '2026-11-06',
      medicaidProvider: 'no',
      category: 'vision',
      attachmentIds: ['att-eye'],
    }),
    bill('pt', {
      provider: 'Albany Physical Therapy',
      serviceDate: '2026-11-12',
      amountCents: 6400,
      status: 'unpaid',
      medicaidProvider: 'yes',
      category: 'therapy',
    }),
  ];
  const att = (id, billId, p, name) => ({
    id,
    billId,
    mime: 'image/jpeg',
    name,
    createdAt: '2026-11-01T12:00:00.000Z',
    ...p,
  });
  return {
    format: 'spendtally-backup',
    version: 1,
    appVersion: 'demo',
    exportedAt: NOW.toISOString(),
    settings: {
      onboarded: true,
      stateCode: 'NY',
      spenddownCents: 75000,
      amountBasis: 'month',
      periodMonths: 1,
      periodAnchor: '2026-09',
      theme: 'system',
      textSize: 'normal',
      profile: {
        fullName: 'Rose Alvarez',
        medicaidId: 'AB12345C',
        caseNumber: '0049921-7',
        dateOfBirth: '1951-03-14',
        phone: '(518) 555-0142',
        address: '22 Elm Street, Albany, NY 12202',
        agencyName: 'Albany County DSS — Medicaid Excess Income Unit',
        agencyFax: '(518) 555-0100',
        caseworker: 'Ms. J. Rivera',
      },
    },
    bills,
    submissions: [
      {
        id: 'sub-sep',
        periodKey: '2026-09',
        createdAt: '2026-10-02T15:00:00.000Z',
        applied: { northgate: 75000 },
        billIds: ['northgate'],
        totalCents: 124000,
        method: 'fax',
      },
    ],
    attachments: [
      att('att-mercy', 'mercy', mercy, 'mercy.jpg'),
      att('att-pharm', 'pharm-nov', pharmacy, 'receipt.jpg'),
      att('att-eye', 'eye', eye, 'eye-care.jpg'),
    ],
  };
}

async function newContext(opts = {}) {
  const context = await browser.newContext({
    viewport: { width: 400, height: 860 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    acceptDownloads: true,
    ...opts,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  // Toasts are transient; keep them out of the pictures.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.toasts{display:none!important}';
      document.head.appendChild(style);
    });
  });
  return { context, page };
}

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(opts.wait ?? 900);
  await page.screenshot({ path: join(out, `${name}.png`), ...opts.screenshot });
  console.log(`✔ docs/images/${name}.png`);
}

async function restoreDemo(page, file) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Get started' }).waitFor();
  await page.locator('input[type=file][accept*="json"]').setInputFiles(file);
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByTestId('ring-status').waitFor();
}

await waitForServer();
const backupFile = join(work, 'demo-backup.json');
writeFileSync(backupFile, JSON.stringify(await demoBackup()));

// Welcome
{
  const { context, page } = await newContext();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Get started' }).waitFor();
  await shot(page, 'welcome');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: /New York/ }).click();
  await shot(page, 'welcome-state');
  await context.close();
}

// Main app with demo data
{
  const { context, page } = await newContext();
  await restoreDemo(page, backupFile);
  await shot(page, 'home', { wait: 1600 });
  await page
    .getByRole('region', { name: 'Things to know' })
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'home-alerts');
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.goto(`${BASE}#/bills`);
  await shot(page, 'bills');

  await page.goto(`${BASE}#/bills/mercy`);
  await page.getByLabel('Provider').waitFor();
  await page.getByRole('region', { name: 'Things to know about this bill' }).evaluate((el) => {
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 330);
  });
  await shot(page, 'bill-warnings');

  await page.goto(`${BASE}#/add`);
  await shot(page, 'scan-choose');
  await page.getByTestId('file-input').setInputFiles(join(fixtures, 'sample-bill.png'));
  await page
    .getByText('Reading your bill')
    .first()
    .waitFor()
    .catch(() => undefined);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(out, 'scan-reading.png') });
  console.log('✔ docs/images/scan-reading.png');
  await page.getByText('Found on bill').first().waitFor({ timeout: 90_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'scan-result', { wait: 4200 });

  await page.goto(`${BASE}#/packet/2026-10`);
  await page.getByTestId('build-packet').waitFor();
  await shot(page, 'packet');
  // Include the hospital bill too, so the sample packet has a copy page.
  await page.getByRole('checkbox').last().check();
  await page.getByTestId('build-packet').click();
  await page.getByTestId('download-packet').waitFor();
  const dl = page.waitForEvent('download');
  await page.getByTestId('download-packet').click();
  const pdfPath = join(work, 'packet.pdf');
  await (await dl).saveAs(pdfPath);

  await page.goto(`${BASE}#/help`);
  await shot(page, 'help');

  await page.goto(`${BASE}#/settings`);
  await shot(page, 'settings');

  // Render the first two packet pages for the README.
  if (existsSync(pdfPath)) {
    try {
      execFileSync('pdftoppm', [
        '-png',
        '-r',
        '80',
        '-f',
        '1',
        '-l',
        '3',
        pdfPath,
        join(work, 'pdf'),
      ]);
      for (const [n, name] of [
        ['1', 'packet-cover'],
        ['2', 'packet-list'],
        ['3', 'packet-copy'],
      ]) {
        const src = [join(work, `pdf-${n}.png`), join(work, `pdf-0${n}.png`)].find(existsSync);
        if (src) {
          writeFileSync(join(out, `${name}.png`), readFileSync(src));
          console.log(`✔ docs/images/${name}.png`);
        }
      }
      writeFileSync(join(out, 'sample-packet.pdf'), readFileSync(pdfPath));
      console.log('✔ docs/images/sample-packet.pdf');
    } catch {
      console.warn('! pdftoppm not available; skipped packet page images');
    }
  }
  await context.close();
}

// Dark mode
{
  const { context, page } = await newContext({ colorScheme: 'dark' });
  await restoreDemo(page, backupFile);
  await shot(page, 'home-dark', { wait: 1600 });
  await context.close();
}

// Hero banner: three screens on a soft gradient.
{
  const img = (n) =>
    `data:image/png;base64,${readFileSync(join(out, `${n}.png`)).toString('base64')}`;
  const logo = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8');
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;width:1600px;height:900px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
      background:radial-gradient(1200px 700px at 15% 10%,#dcefeb 0%,transparent 60%),radial-gradient(900px 600px at 95% 100%,#fbecd3 0%,transparent 55%),#f6f4ee;
      display:flex;align-items:center;gap:48px;padding:0 64px;box-sizing:border-box;overflow:hidden;color:#1b2422}
    .copy{width:480px;flex:none}
    .logo{display:flex;align-items:center;gap:18px;font-weight:800;font-size:46px;letter-spacing:-.02em}
    .logo svg{width:76px;height:76px}
    h1{font-size:46px;line-height:1.08;margin:28px 0 18px;letter-spacing:-.025em}
    p{font-size:23px;line-height:1.5;color:#4b5754;margin:0}
    .pills{display:flex;gap:10px;margin-top:28px;flex-wrap:wrap}
    .pill{background:#fff;border-radius:999px;padding:9px 16px;font-size:17px;font-weight:650;color:#0f5f55;box-shadow:0 2px 10px rgb(0 0 0 / 6%)}
    .phones{display:flex;gap:24px;align-items:center}
    .phone{width:268px;border-radius:38px;padding:9px;background:#1b2422;box-shadow:0 30px 80px rgb(15 40 36 / 28%)}
    .phone img{width:100%;border-radius:30px;display:block}
    .phone.mid{transform:translateY(-26px)}
  </style></head><body>
    <div class="copy">
      <div class="logo">${logo.replace(/<title>.*?<\/title>/, '')}Spendtally</div>
      <h1>Your Medicaid spend-down, tallied bill by bill.</h1>
      <p>Snap a bill. Spendtally reads it on your device, files it in the right month and shows how close you are. Then it builds the packet for your caseworker.</p>
      <div class="pills"><span class="pill">On-device OCR</span><span class="pill">Works offline</span><span class="pill">Rules for 32 states + DC</span><span class="pill">Free &amp; open source</span></div>
    </div>
    <div class="phones">
      <div class="phone"><img src="${img('scan-result')}"></div>
      <div class="phone mid"><img src="${img('home')}"></div>
      <div class="phone"><img src="${img('packet')}"></div>
    </div>
  </body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, 'hero.png') });
  console.log('✔ docs/images/hero.png');
  await page.close();
}

await browser.close();
rmSync(work, { recursive: true, force: true });
stop();
process.exit(0);
