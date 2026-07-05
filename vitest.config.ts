import path from 'path';
import { defineConfig } from 'vitest/config';

// Mirrors the "@/*" -> "./src/*" path alias from tsconfig.json, which Next.js
// resolves natively but Vitest does not without this config.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
