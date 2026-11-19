#!/usr/bin/env node
// Renders the SVG logo to the PNG icons the web app manifest and iOS need.
// Uses Playwright's Chromium so no native image libraries are required.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logo = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8');
const maskable = readFileSync(join(root, 'public', 'icons', 'maskable.svg'), 'utf8');

const targets = [
  { svg: logo, size: 192, out: 'public/icons/icon-192.png', transparent: true },
  { svg: logo, size: 512, out: 'public/icons/icon-512.png', transparent: true },
  { svg: maskable, size: 512, out: 'public/icons/icon-maskable-512.png' },
  { svg: maskable, size: 180, out: 'public/icons/apple-touch-icon.png' },
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${t.svg.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)}</body></html>`,
  );
  const buf = await page.screenshot({
    omitBackground: !!t.transparent,
    clip: { x: 0, y: 0, width: t.size, height: t.size },
  });
  writeFileSync(join(root, t.out), buf);
  console.log(`✔ ${t.out}`);
}
await browser.close();
