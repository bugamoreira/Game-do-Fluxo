import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        player: resolve(__dirname, 'jogar.html'),
        instructor: resolve(__dirname, 'instrutor.html'),
        projector: resolve(__dirname, 'projetor.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: '/',
  },
});
