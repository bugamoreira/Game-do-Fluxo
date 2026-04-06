import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        player: resolve(__dirname, 'index.html'),
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
