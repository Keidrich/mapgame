import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Stamped into the build so "is the new version actually live?" is answerable on the screen. */
const BUILD_ID = (process.env.CF_PAGES_COMMIT_SHA ?? process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? '').slice(0, 7)
  || new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  resolve: {
    alias: {
      '@sim': dir('./sim'),
      '@content': dir('./content'),
      '@ui': dir('./ui'),
      '@geo': dir('./geo'),
      '@r': dir('./remake'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // ui/main.tsx registers the worker itself: the injected one-liner never noticed a new
      // build, so a shipped change sat behind the cached old one until enough reloads
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rackets: Crime Empire',
        short_name: 'Rackets',
        description: 'Build a criminal empire on the real-world map.',
        theme_color: '#0b0d10',
        background_color: '#0b0d10',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        runtimeCaching: [
          // the Remake's two faces, so the game looks the same offline once it has been opened once
          { urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i, handler: 'StaleWhileRevalidate', options: { cacheName: 'font-css' } },
          { urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i, handler: 'CacheFirst', options: { cacheName: 'font-files', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } } },
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'vector-tiles', expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 14 } },
          },
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'raster-tiles', expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 14 } },
          },
        ],
      },
    }),
  ],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  // maplibre-gl ships its worker as a separate module that the dep optimizer breaks in dev
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  server: { port: 5173 },
});
