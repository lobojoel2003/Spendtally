#!/usr/bin/env node
// Writes the supported-states table into README.md between the states markers.
//   node scripts/states-table.mjs          → update README.md
//   node scripts/states-table.mjs --check  → exit 1 if README.md is out of date
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'rules', 'states');
const states = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .sort((a, b) => a.name.localeCompare(b.name));

const METHODS = {
  fax: 'Fax',
  mail: 'Mail',
  upload: 'Upload',
  'in-person': 'In person',
  email: 'Email',
  phone: 'Phone',
};
const months = (s) =>
  s.period.allowedMonths.map((m) => `${m}`).join(' or ') +
  (s.period.allowedMonths.length === 1 && s.period.allowedMonths[0] === 1 ? ' month' : ' months');
const yes = (v) => (v === true ? 'Yes' : v === false ? 'No' : '—');
const conf = { high: '🟢 High', medium: '🟡 Medium', low: '🟠 Low' };

const rows = states.map(
  (s) =>
    `| ${s.name} | ${s.programName.replace(/\|/g, '/')} | ${months(s)} | ${s.submission.methods.map((m) => METHODS[m] ?? m).join(', ')} | ${yes(s.submission.payIn)} | ${conf[s.confidence]} |`,
);
const table = [
  '| State | Program | Period | Send bills by | Pay-in | Confidence |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows,
].join('\n');

const readmePath = join(root, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
const start = '<!-- states:start -->';
const end = '<!-- states:end -->';
const i = readme.indexOf(start);
const j = readme.indexOf(end);
if (i === -1 || j === -1) {
  console.error('README.md is missing the states markers');
  process.exit(1);
}
const raw = `${readme.slice(0, i + start.length)}\n\n${table}\n\n${readme.slice(j)}`;
// Format like the rest of the repo so `prettier --check` and this script agree.
const options = (await prettier.resolveConfig(readmePath)) ?? {};
const next = await prettier.format(raw, { ...options, filepath: readmePath });
if (process.argv.includes('--check')) {
  if (next !== readme) {
    console.error('✖ README.md state table is out of date. Run: npm run docs:states');
    process.exit(1);
  }
  console.log(`✔ README.md lists all ${states.length} rule files`);
} else {
  writeFileSync(readmePath, next);
  console.log(`✔ README.md table updated (${states.length} rule files)`);
}
