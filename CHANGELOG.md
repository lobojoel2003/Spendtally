# Changelog

All notable changes to Spendtally are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Build numbers are the commit count on `main` at release time.

## [Unreleased]

## [1.0.0] - 2026-11-19

The first public release of Spendtally: a local-first, installable app that tracks medical bills against a Medicaid spend-down, period by period.

### Added

- **Scan a bill.** Take a photo or choose an image or PDF. On-device OCR (Tesseract.js, self-hosted, LSTM engine) reads the date of service, provider, amount and paid/unpaid status. Detected fields are highlighted, with one-tap alternatives for other dates and amounts on the page. OCR handles side-by-side letterheads, wrapped provider names, statement dates, birth dates and common digit mistakes.
- **Spend-down ledger.** Supports 1–6 month periods with per-month or per-period amounts. Paid bills count in the month of service (or the payment month where the state counts paid bills when paid). Unpaid balances carry forward. The one-month rule applies to unpaid bills from Medicaid providers. Bills sent in a packet are locked so they are never double-counted.
- **Progress ring** for the selected period, with a recent-months strip, period navigation and a small celebration when the spend-down is met.
- **Plain-language warnings** for the one-month rule, providers that don't take Medicaid, the never-covered spend-down share, "Medicaid may pay the rest", paid-in-another-month, possible duplicates, future dates and missing copies. Also home-screen alerts for periods that are met but not sent, and pay-in options.
- **Submission packet PDF** (pdf-lib): a fax-ready cover sheet, a bill list with monthly subtotals and totals, and labeled copies of every photo or PDF bill. Name, Medicaid ID and page numbers are on every page. Download, share or print it, then mark it as sent.
- **State rules** for 32 states and DC: program name, local term, period length, how to send bills, pay-in option, carry-over and premium rules, notes and sources. Every file is validated against a JSON Schema in CI. There is an "Another state" fallback.
- **Guided setup:** state, spend-down amount (with a rough income-minus-limit helper) and period.
- **Bills list** grouped by month of service, with search and filters (unpaid, paid, needs a check, not sent).
- **Settings:** cover-sheet details, text size (three levels), light/dark/automatic theme, offline download of the bill reader, JSON backup and restore, delete all data, and version, build number and commit.
- **"How spend-down works" guide** with the selected state's rules, sources and the 2027 retroactive-coverage change.
- **PWA:** installable, works offline, precaches the app shell, caches the OCR engine on first use, prompts when an update is ready, and asks for persistent storage.
- **Accessibility:** large type and tap targets, screen-reader labels, focus styles, skip link and reduced-motion support.
- **Tooling:** Vitest unit tests, Playwright end-to-end tests (including a real OCR scan), ESLint, Prettier, TypeScript strict mode, CI, a Pages deploy, tag-driven releases, CodeQL and Dependabot.

[Unreleased]: https://github.com/lobojoel2003/Spendtally/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lobojoel2003/Spendtally/releases/tag/v1.0.0
