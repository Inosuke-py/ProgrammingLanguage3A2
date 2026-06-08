import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // we register manually from main.jsx so we control the migration
      includeAssets: [
        'favicon.svg',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable-512.png',
      ],
      manifest: {
        name: 'Lexara — AI-Powered Learning',
        short_name: 'Lexara',
        description: 'AI-powered interactive quiz generator. Transform any content into beautifully crafted quizzes.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0c0e13',
        theme_color: '#0c0e13',
        lang: 'en',
        categories: ['education', 'productivity'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Take control on first navigate after activate; skipWaiting handled below.
        clientsClaim: true,
        skipWaiting: true,

        // Allow precaching files up to 5 MB (PDFs are not precached, just shell).
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

        // Bump the navigation fallback URL allowlist so SPA routes work offline.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/health$/, /^\/socket\.io\//],

        runtimeCaching: [
          // Cache opened PDFs — CacheFirst, expire after 30 days, max 50 entries.
          // Pattern matches the production API path /api/v1/modules/:id/file
          // (and the legacy /api/modules/:id/file just in case).
          {
            urlPattern: ({ url }) =>
              /^\/api\/(v1\/)?modules\/[^/]+\/file$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lexara-pdf-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true, // PDFs use range requests
            },
          },
          // Cache module thumbnails / images
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'lexara-images',
              expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          // Cache Google Fonts (CSS + actual font files) — StaleWhileRevalidate so
          // the network is preferred but fallback works offline.
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],

        // Don't cache the API responses (always go network) by default.
        // The runtimeCaching above already opts in for PDFs and images explicitly.
      },
      devOptions: {
        enabled: false, // PWA off in dev; only built output gets a SW
      },
    }),
  ],
  server: {
    port: 5173,
    // Proxy API + Socket.IO to the local backend so the client
    // can hit /api/* and /socket.io/* without hard-coding the
    // server URL or dealing with CORS in dev.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,                  // critical: WebSocket upgrade
      },
    },
  },
})
