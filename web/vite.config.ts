import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Multi-page, not a SPA. S3 website hosting answers an unknown path with the
// error document *and a 404 status*; client-side routing would need CloudFront
// to rewrite that to 200, and CloudFront is not available locally.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        board: resolve(__dirname, 'index.html'),
        console: resolve(__dirname, 'console/index.html'),
        error: resolve(__dirname, 'error.html'),
      },
    },
  },
});
