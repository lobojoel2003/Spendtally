# Security policy

Spendtally stores sensitive health and financial information on people's devices. We take its security seriously.

## Supported versions

Only the latest release receives security fixes. The live app at <https://lobojoel2003.github.io/Spendtally/> always runs the latest version from `main`.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub's [private vulnerability reporting](https://github.com/lobojoel2003/Spendtally/security/advisories/new).

Include what you found, how to reproduce it, and its impact. You'll get an acknowledgement within a week. Please give us a reasonable amount of time to release a fix before you disclose it.

## Design notes

- No server-side component, account system or analytics.
- All data is in the browser's IndexedDB on the user's device.
- OCR (Tesseract.js) and PDF generation (pdf-lib) run entirely client-side. All OCR assets are self-hosted.
- Dependencies are watched by Dependabot, and code is scanned with CodeQL.
