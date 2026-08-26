import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Electron loads the built app from a relative path, so base must be './'
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
