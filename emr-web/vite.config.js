import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/emr': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../backend/public/opd',
    emptyOutDir: true,
  },
});
