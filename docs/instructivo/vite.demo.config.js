// Copia de la app con datos de EJEMPLO en memoria, sólo para sacar capturas del instructivo.
// Uso: npx vite --config docs/instructivo/vite.demo.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../..', import.meta.url));
const demo = fileURLToPath(new URL('./demo/supabase-demo.js', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('../../client', import.meta.url)),
  base: './',
  plugins: [react()],
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  resolve: {
    alias: [
      { find: /^\.\/supabase\.js$/, replacement: demo },
      { find: 'pdfkit', replacement: fileURLToPath(new URL('../../node_modules/pdfkit/js/pdfkit.standalone.js', import.meta.url)) },
      { find: 'exceljs', replacement: fileURLToPath(new URL('../../node_modules/exceljs/dist/exceljs.min.js', import.meta.url)) },
    ],
  },
  server: { port: 5199, strictPort: true, fs: { allow: [raiz] } },
});
