import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const server = 'http://localhost:4700';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/api': server, '/files': server },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
