import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs separately (npm run server, port 3001);
// Vite forwards /api calls to it so the browser sees one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
});
