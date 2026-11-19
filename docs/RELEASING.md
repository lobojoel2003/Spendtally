# Releasing Spendtally

Spendtally uses [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

| Change                                                                                | Bump  |
| ------------------------------------------------------------------------------------- | ----- |
| Backup format or stored data changes that older versions can't read; removed features | MAJOR |
| New features, new states, new warnings                                                | MINOR |
| Fixes, rule corrections, copy changes                                                 | PATCH |

## Build numbers

The build number is `git rev-list --count HEAD`, the number of commits in the history being built. It:

- only goes up on `main`,
- is identical for anyone building the same commit, so builds can be reproduced,
- is shown in the app as `1.2.0 (build 57)` under **Settings → About**, next to the short commit hash and build date,
- appears in release file names: `spendtally-1.2.0-build.57-web.zip`.

CI checks out the full history (`fetch-depth: 0`) so the count is correct. Set `BUILD_NUMBER` to override it.

## Steps

1. Make sure `main` is green.
2. Move the items under `## [Unreleased]` in `CHANGELOG.md` into a new `## [X.Y.Z] - YYYY-MM-DD` section, and update the comparison links at the bottom.
3. Bump, commit and tag in one step. npm runs `scripts/check-version.mjs`, which refuses if the changelog section is missing:

   ```bash
   npm version X.Y.Z -m "chore(release): v%s"
   ```

4. Push the commit and the tag:

   ```bash
   git push --follow-tags
   ```

   **Or, without pushing a tag from your machine:** push the version commit to `main`, then open
   **Actions → Release → Run workflow**, pick `main` and enter the tag (for example `v1.2.0`). The
   workflow runs every check first, then creates the annotated tag on that commit (attributed to
   you) and publishes the release.

5. The [Release workflow](../.github/workflows/release.yml):
   - checks that the tag, `package.json` and `CHANGELOG.md` agree,
   - runs lint, type checks, rule validation, unit tests and end-to-end tests,
   - builds with `RELEASE_CHANNEL=stable`,
   - publishes a GitHub Release with the release notes from the changelog and these assets:
     - `spendtally-X.Y.Z-build.N-web.zip`: the static app, ready for any HTTPS host,
     - `spendtally-X.Y.Z-sample-packet.pdf`: an example submission packet,
     - `SHA256SUMS.txt`.

Tags containing a hyphen (for example `v1.3.0-beta.1`) are published as pre-releases.

To rebuild the assets for an existing tag, run the **Release** workflow manually and enter the tag.
