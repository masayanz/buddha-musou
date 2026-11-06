import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  base: './',
  // Keep reference art out of Pages while still publishing the game's audio files.
  publicDir: mode === 'pages' ? false : 'public',
  plugins: mode === 'pages' ? [{
    name: 'pages-combat-audio',
    closeBundle() {
      const source = new URL('./public/assets/audio/', import.meta.url);
      const destination = new URL('./dist/assets/audio/', import.meta.url);
      mkdirSync(destination, { recursive: true });
      for (const file of readdirSync(source)) {
        if (file.endsWith('.ogg')) copyFileSync(new URL(file, source), new URL(file, destination));
      }
    },
  }] : [],
  server: { host: '127.0.0.1' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
