import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Single-page, unlike web/. GitHub Pages has no rewrite rule, so `npm run build`
// copies index.html to 404.html and the router resolves deep links client-side.
//
// base is '/' because docs/public/CNAME points a custom domain at the site root.
// Drop the custom domain and this must become '/BananaOnCall/'.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: { outDir: 'dist', emptyOutDir: true },
});
