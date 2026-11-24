import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// JSX lewat transform bawaan Vite (oxc). Tanpa plugin tambahan.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@v3/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) } },
  server: { proxy: { '/api': 'http://localhost:3000', '/healthz': 'http://localhost:3000' } },
  // CSS mockup memakai light-dark(); transform/minify lightningcss mengubahnya dan merusak border & tema.
  // CSS disajikan apa adanya (tanpa transform) agar tampilan identik dengan mockup.
  css: { transformer: 'postcss' },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true, cssMinify: false },
});
