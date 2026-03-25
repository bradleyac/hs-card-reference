import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'HS Card Reference',
        short_name: 'HS Ref',
        description: 'Hearthstone Battlegrounds card reference',
        theme_color: '#1a1208',
        background_color: '#0f0c07',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Cache card render images aggressively
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/art\.hearthstonejson\.com\/v1\/render\/latest\/enUS\/256x\/.+\.png$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-renders-256',
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            urlPattern: /^https:\/\/art\.hearthstonejson\.com\/v1\/render\/latest\/enUS\/512x\/.+\.png$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-renders-512',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
