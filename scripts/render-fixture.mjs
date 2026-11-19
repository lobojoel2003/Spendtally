#!/usr/bin/env node
// Renders tests/fixtures/*.html bills to PNG photos used by e2e tests and README screenshots.
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
for (const file of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
  await page.goto(pathToFileURL(join(dir, file)).href);
  const out = join(dir, file.replace(/\.html$/, '.png'));
  await page.locator('.page').screenshot({ path: out });
  console.log(`✔ ${out}`);
}
await browser.close();
