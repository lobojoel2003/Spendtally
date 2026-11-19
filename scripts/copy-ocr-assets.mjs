#!/usr/bin/env node
// Copies the Tesseract.js worker, WebAssembly cores and English language data into
// public/ocr so OCR runs fully on-device, with no CDN requests.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');

const tesseractDir = dirname(require.resolve('tesseract.js/package.json'));
const coreDir = dirname(
  require.resolve('tesseract.js-core/package.json', { paths: [tesseractDir] }),
);
const engDir = dirname(require.resolve('@tesseract.js-data/eng/package.json'));

const files = [
  [join(tesseractDir, 'dist', 'worker.min.js'), join(out, 'worker.min.js')],
  // LSTM-only builds: Spendtally always uses OEM 1 (LSTM), so the legacy builds are never loaded.
  [join(coreDir, 'tesseract-core-lstm.wasm.js'), join(out, 'core', 'tesseract-core-lstm.wasm.js')],
  [
    join(coreDir, 'tesseract-core-simd-lstm.wasm.js'),
    join(out, 'core', 'tesseract-core-simd-lstm.wasm.js'),
  ],
  [
    join(coreDir, 'tesseract-core-relaxedsimd-lstm.wasm.js'),
    join(out, 'core', 'tesseract-core-relaxedsimd-lstm.wasm.js'),
  ],
  [join(engDir, '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'lang', 'eng.traineddata.gz')],
];

let copied = 0;
for (const [from, to] of files) {
  if (!existsSync(from)) {
    console.error(`[ocr] missing ${from}`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  copied++;
}
console.log(`[ocr] ${copied ? `copied ${copied} file(s)` : 'assets up to date'} → public/ocr`);
