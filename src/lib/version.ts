export const BUILD = {
  version: __APP_VERSION__,
  build: __BUILD_NUMBER__,
  commit: __COMMIT__,
  date: __BUILD_DATE__,
  channel: __CHANNEL__,
} as const;

/** e.g. `1.2.0 (build 57)` */
export function versionLabel(): string {
  return `${BUILD.version} (build ${BUILD.build})`;
}
