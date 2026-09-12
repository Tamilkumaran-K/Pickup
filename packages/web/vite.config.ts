import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.ELECTRON === 'true' ? './' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0', // Accessible on local network for phone testing!
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});
