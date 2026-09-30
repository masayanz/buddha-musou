import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  base: './',
  // The procedural game uses no public assets; keep reference art out of the published site.
  publicDir: mode === 'pages' ? false : 'public',
  server: { host: '127.0.0.1' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
