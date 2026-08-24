import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En desarrollo la interfaz corre en el 5173 y el backend en el 8099.
    // En produccion no hace falta: el backend sirve el build ya compilado.
    proxy: { '/api': { target: 'http://localhost:8099', changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
