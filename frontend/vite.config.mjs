import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const path = relative => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  root: path('./'),
  base: './',
  appType: 'mpa',
  cacheDir: path('./node_modules/.vite/'),
  server: {
    host: '127.0.0.1',
    port: 0,
    fs: {
      strict: true,
      // Explicitly limit source serving; never use the detected workspace root.
      allow: [path('./')],
      deny: ['**/.git/**', '**/.env', '**/.env.*', '**/*.{pem,crt,key}', '**/backend/**', '**/scripts/**', '**/package.json', '**/package-lock.json', '**/vite.config.*']
    }
  },
  optimizeDeps: { exclude: ['easywindowspack'] },
  build: {
    outDir: path('../output/frontend/'),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: path('./index.html'), components: path('./src/components.html') }
    }
  },
  preview: { host: '127.0.0.1', port: 0 }
});