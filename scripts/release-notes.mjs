#!/usr/bin/env node
// Prints the CHANGELOG.md section for a version: `node scripts/release-notes.mjs 1.2.0`
import { readFileSync } from 'node:fs';

const version = (process.argv[2] ?? '').replace(/^v/, '');
if (!version) {
  console.error('usage: release-notes.mjs <version>');
  process.exit(1);
}
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const lines = changelog.split('\n');
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && /^## \[/.test(l));
if (end === -1) end = lines.length;
const body = lines
  .slice(start + 1, end)
  .filter((l) => !/^\[[^\]]+\]: /.test(l))
  .join('\n')
  .trim();
console.log(body);
