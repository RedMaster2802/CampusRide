// web/vite.config.ts
// Vite config with PWA

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // favicon.ico and robots.txt are in public/ and will be copied automatically
      manifest: {
        name: 'GatePool',
        short_name: 'GatePool',
        description: 'Share cabs with fellow students',
        theme_color: '#1F5F4A',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes('supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) {
              return 'vendor';
            }
            if (id.includes('/@supabase/')) {
              return 'supabase';
            }
            if (id.includes('/@tanstack/')) {
              return 'query';
            }
            if (id.includes('/react-hook-form/') || id.includes('/zod/') || id.includes('/@hookform/')) {
              return 'forms';
            }
            if (id.includes('/lucide-react/') || id.includes('/sonner/')) {
              return 'ui';
            }
            return 'vendor';
          }
        },
      },
    },
  },
});