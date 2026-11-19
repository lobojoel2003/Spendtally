import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const FIXTURE = new URL('../fixtures/sample-bill.png', import.meta.url).pathname;

async function onboard(page: Page, opts: { state?: string; amount?: string } = {}) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Spendtally' })).toBeVisible();
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByLabel('Search states').fill(opts.state ?? 'New York');
  await page.getByRole('button', { name: new RegExp(opts.state ?? 'New York') }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Amount on your notice').fill(opts.amount ?? '500');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: '1 month', exact: true }).click();
  await page.getByRole('button', { name: 'Start tracking' }).click();
  await expect(page.getByTestId('ring-status')).toBeVisible();
}

async function addManualBill(
  page: Page,
  bill: {
    provider: string;
    date: string;
    amount: string;
    paid?: boolean;
    medicaid?: 'Yes' | 'No' | 'Not sure';
  },
) {
  await page.goto('./#/add');
  await page.getByTestId('manual-entry').click();
  await page.getByLabel('Provider').fill(bill.provider);
  await page.getByLabel('Date of service').fill(bill.date);
  await page.getByLabel('Amount you paid or owe').fill(bill.amount);
  if (bill.paid) await page.getByRole('button', { name: 'Yes, paid' }).click();
  await page.getByRole('button', { name: bill.medicaid ?? 'Yes', exact: true }).click();
  await page.getByTestId('save-bill').click();
  await expect(page.getByTestId('ring-status')).toBeVisible();
}

function thisMonth(day = 2) {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

test('first run walks through setup and shows an empty ring', async ({ page }) => {
  await onboard(page);
  await expect(page.getByTestId('ring-status')).toHaveText('$500.00 to go');
  await expect(page.getByRole('heading', { name: 'Add your first bill' })).toBeVisible();
});

test('adding bills fills the ring and meets the spend-down', async ({ page }) => {
  await onboard(page);
  await addManualBill(page, {
    provider: 'Hudson Pharmacy',
    date: thisMonth(1),
    amount: '120.50',
    paid: true,
  });
  await expect(page.getByTestId('ring-status')).toHaveText('$379.50 to go');
  await addManualBill(page, {
    provider: 'Albany Cardiology',
    date: thisMonth(2),
    amount: '420',
    medicaid: 'No',
  });
  await expect(page.getByTestId('ring-status')).toContainText('Spend-down met');

  await page.getByRole('link', { name: 'Bills' }).click();
  await expect(page.getByTestId('bill-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Unpaid' }).click();
  await expect(page.getByTestId('bill-card')).toHaveCount(1);
  await page.getByTestId('bill-card').click();
  await expect(page.getByText('Provider does not take Medicaid')).toBeVisible();
});

test('warns about the one-month rule for unpaid Medicaid-provider bills', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/add');
  await page.getByTestId('manual-entry').click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByText('Counts for one month only')).toBeVisible();
});

test('reads a bill photo on the device', async ({ page }) => {
  test.slow();
  await onboard(page);
  await page.goto('./#/add');
  await page.getByTestId('file-input').setInputFiles(FIXTURE);
  await expect(page.getByLabel('Provider')).toHaveValue(/Mercy General Hospital/i, {
    timeout: 90_000,
  });
  await expect(page.getByLabel('Date of service')).toHaveValue('2026-10-28');
  await expect(page.getByLabel('Amount you paid or owe')).toHaveValue('391.28');
  await expect(page.getByText('Found on bill').first()).toBeVisible();
});

test('builds a submission packet PDF and marks it sent', async ({ page }) => {
  await onboard(page);
  await addManualBill(page, {
    provider: 'Mercy General Hospital',
    date: thisMonth(3),
    amount: '600',
    medicaid: 'No',
  });
  await page.getByRole('link', { name: 'Build packet' }).first().click();
  await page.getByLabel('Your full name').fill('Rose Alvarez');
  await page.getByLabel('Medicaid ID / CIN').fill('AB12345C');
  await page.getByTestId('build-packet').click();
  await expect(page.getByRole('heading', { name: 'Your packet is ready' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-packet').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^spendtally-\d{4}-\d{2}\.pdf$/);
  const path = await download.path();
  expect(readFileSync(path).subarray(0, 5).toString()).toBe('%PDF-');

  await page.getByTestId('mark-sent').click();
  await page.getByRole('button', { name: 'Yes, I sent it' }).click();
  await expect(page.getByText(/^Sent on /)).toBeVisible();
});

test('settings show version and build number', async ({ page }) => {
  await onboard(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('version')).toHaveText(/^\d+\.\d+\.\d+ \(build [\w.-]+\)$/);
});

test('data survives a reload', async ({ page }) => {
  await onboard(page);
  await addManualBill(page, {
    provider: 'Lakeside Clinic',
    date: thisMonth(4),
    amount: '75',
    paid: true,
  });
  await page.reload();
  await expect(page.getByTestId('ring-status')).toHaveText('$425.00 to go');
});
