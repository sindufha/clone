import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt', injectRegister: 'auto', includeAssets: ['icons/*.png', 'favicon.svg', 'push-sw.js'],
    manifest: { id: '/', name: 'NEXUS — Pengingat Tugas', short_name: 'NEXUS', description: 'Tugas semester dan pengingat deadline dari Moodle.',
      lang: 'id', start_url: '/', scope: '/', display: 'standalone', background_color: '#f5f7f6', theme_color: '#087c54',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { importScripts: ['/push-sw.js'], globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      navigateFallbackDenylist: [/^\/api\//], cleanupOutdatedCaches: true,
      runtimeCaching: [{ urlPattern: /\/api\//, handler: 'NetworkOnly', method: 'GET' }],
    },
    devOptions: { enabled: false },
  })],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  build: { sourcemap: false },
});
