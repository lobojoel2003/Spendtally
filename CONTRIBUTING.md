# Contributing to Spendtally

Thank you for helping people keep their Medicaid coverage. Contributions of every size are welcome, and state rule corrections are especially valuable.

## Ground rules

- Be kind. People who use Spendtally are often older, disabled, or dealing with stressful paperwork.
- Privacy comes first. Spendtally must never send bill data anywhere. No analytics, no remote OCR, no third-party CDNs.
- Accessibility is a requirement: large type, large tap targets, labels for screen readers, and plain language (aim for an 8th-grade reading level).

## Development setup

```bash
npm ci
```

```bash
npm run dev
```

Before opening a pull request:

```bash
npm run check
```

```bash
npm run build && npm run test:e2e
```

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `rules(NY):`, `chore:`…). Add a line under `## [Unreleased]` in `CHANGELOG.md` for anything a user would notice.

## Updating state rules

State rules live in `rules/states/XX.json` and must follow [`rules/schema.json`](rules/schema.json).

1. Prefer **official sources**: state Medicaid manuals, agency pages and notices. Legal-aid guides are a good second choice.
2. Add every source to `sources`, and set `lastReviewed` to today.
3. Use `null` when a fact can't be confirmed. Don't guess.
4. Keep `notes` short and plain (under 200 characters each, at most 4).
5. Set `confidence`: `high` when an official source confirms the period and submission method, `medium` when some facts come from secondary sources, `low` otherwise.
6. Run `npm run validate:rules` and `npm run docs:states` (this updates the table in the README).

Adding a new state? Copy a similar state's file, rename it to the two-letter code, and update every field.

## Code layout

See the [project layout](README.md#project-layout) in the README. The ledger rules are documented in [docs/SPEND-DOWN-RULES.md](docs/SPEND-DOWN-RULES.md). Changes to `src/lib/engine.ts` need unit tests in `tests/unit/engine.test.ts`.

## Reporting bugs

Open an issue with your device, browser, the app version and build number (**Settings → About**), and the steps to reproduce. **Never attach real bills or personal information.**

## License

By contributing, you agree that your contributions are licensed under the GNU General Public License v3.0 or later.
