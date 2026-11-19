/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

const commit = process.env.GITHUB_SHA?.slice(0, 7) ?? git('rev-parse --short HEAD') ?? 'unknown';
const base = process.env.BASE_PATH ?? '/';
/** Build number = number of commits, so it only ever goes up and any build can be reproduced. */
const buildNumber = process.env.BUILD_NUMBER ?? git('rev-list --count HEAD') ?? '0';
const channel = process.env.RELEASE_CHANNEL ?? (process.env.CI ? 'ci' : 'dev');

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
    __COMMIT__: JSON.stringify(commit),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __CHANNEL__: JSON.stringify(channel),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: './',
        name: 'Spendtally — Medicaid spend-down tracker',
        short_name: 'Spendtally',
        description:
          'Track medical bills against your Medicaid spend-down, month by month. Private, on-device, works offline.',
        lang: 'en-US',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f4ee',
        theme_color: '#0f5f55',
        categories: ['medical', 'finance', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Scan a bill',
            short_name: 'Scan',
            url: './#/add',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Build packet',
            short_name: 'Packet',
            url: './#/packet',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,txt}'],
        globIgnores: ['ocr/**', 'icons/maskable.svg'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // OCR engine + language data are large, so they are cached the first time they are used.
            urlPattern: ({ url }) => url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'spendtally-ocr',
              expiration: { maxEntries: 12 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/ocr/ocr.ts', 'src/lib/image.ts'],
      reporter: ['text', 'json-summary', 'lcov'],
    },
  },
});
