import { defineConfig } from 'vite';
import { cpSync } from 'fs';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    assetsDir: 'static',
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'copy-assets',
      closeBundle() {
        cpSync('assets', 'dist/assets', { recursive: true });
      },
    },
  ],
});
