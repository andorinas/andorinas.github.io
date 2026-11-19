import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, raiz, 'VITE_');
  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    envDir: raiz,                        // .env en la raíz del proyecto
    base: './',                          // funciona en https://usuario.github.io/repositorio/
    plugins: [react()],
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || '') },
    resolve: {
      alias: {
        // Versiones para navegador de las librerías de informes (las mismas que se prueban en Node).
        pdfkit: fileURLToPath(new URL('../node_modules/pdfkit/js/pdfkit.standalone.js', import.meta.url)),
        exceljs: fileURLToPath(new URL('../node_modules/exceljs/dist/exceljs.min.js', import.meta.url)),
      },
    },
    server: { port: 5173, host: true, fs: { allow: [raiz] } },
    build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2500 },
  };
});
