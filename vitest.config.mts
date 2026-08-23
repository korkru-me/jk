import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Same '@/...' alias tsconfig.json gives the app, so tests import modules
    // by the path the source already uses.
    alias: { '@': import.meta.dirname },
  },
  test: {
    // Only the pure logic is covered: the evaluator, scoring, and the shared
    // text/format helpers. Anything that needs Supabase or a browser is left
    // to manual checking until there is a fixture database to point at.
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
})
