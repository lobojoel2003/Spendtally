#!/usr/bin/env node
// Validates every rules/states/*.json file against rules/schema.json plus a few extra checks
// JSON Schema can't express (file name matches code, default period is allowed, no duplicates).
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(join(root, 'rules', 'schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

const dir = join(root, 'rules', 'states');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort();
const errors = [];
const names = new Set();

for (const file of files) {
  let data;
  try {
    data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  } catch (e) {
    errors.push(`${file}: invalid JSON (${e.message})`);
    continue;
  }
  if (!validate(data)) {
    for (const err of validate.errors ?? [])
      errors.push(`${file}: ${err.instancePath || '/'} ${err.message}`);
    continue;
  }
  if (`${data.code}.json` !== file)
    errors.push(`${file}: code "${data.code}" does not match file name`);
  if (!data.period.allowedMonths.includes(data.period.defaultMonths)) {
    errors.push(
      `${file}: period.defaultMonths (${data.period.defaultMonths}) is not in allowedMonths`,
    );
  }
  if (names.has(data.name)) errors.push(`${file}: duplicate state name "${data.name}"`);
  names.add(data.name);
  if (Number.isNaN(Date.parse(data.lastReviewed)))
    errors.push(`${file}: lastReviewed is not a date`);
}

if (!files.length) errors.push('rules/states contains no rule files');

if (errors.length) {
  console.error(`✖ ${errors.length} problem(s) in state rules:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`✔ ${files.length} state rule files are valid`);
