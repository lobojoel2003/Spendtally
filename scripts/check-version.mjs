#!/usr/bin/env node
// Release guard: the tag, package.json and CHANGELOG.md must all agree.
//   node scripts/check-version.mjs            → checks package.json vs CHANGELOG.md
//   node scripts/check-version.mjs v1.2.0     → also checks the tag
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const tag = process.argv[2];
const problems = [];

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(pkg.version))
  problems.push(`package.json version "${pkg.version}" is not SemVer`);
if (tag && tag.replace(/^v/, '') !== pkg.version)
  problems.push(`tag ${tag} does not match package.json version ${pkg.version}`);
if (!changelog.includes(`## [${pkg.version}]`))
  problems.push(`CHANGELOG.md has no "## [${pkg.version}]" section`);

if (problems.length) {
  console.error(`✖ ${problems.join('\n✖ ')}`);
  process.exit(1);
}
console.log(`✔ version ${pkg.version}${tag ? ` matches ${tag}` : ''} and is in CHANGELOG.md`);
