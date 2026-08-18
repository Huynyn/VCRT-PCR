import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const { version: appVersion } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: 'src/frontend',
  base: './', // Use relative paths for Electron
  build: {
    outDir: '../../dist/frontend',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/frontend/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/frontend'),
      '@/components': resolve(__dirname, 'src/frontend/components'),
      '@/pages': resolve(__dirname, 'src/frontend/pages'),
      '@/hooks': resolve(__dirname, 'src/frontend/hooks'),
      '@/utils': resolve(__dirname, 'src/frontend/utils'),
      '@/services': resolve(__dirname, 'src/frontend/services'),
      '@/context': resolve(__dirname, 'src/frontend/context'),
      '@/types': resolve(__dirname, 'src/shared/types'),
      '@/shared': resolve(__dirname, 'src/shared'),
      '@/assets': resolve(__dirname, 'src/frontend/assets'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})