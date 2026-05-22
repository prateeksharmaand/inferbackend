import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/emr': 'http://localhost:3000',
    },
  },
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
