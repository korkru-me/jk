import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Same '@/...' alias tsconfig.json gives the app, so tests import modules
    // by the path the source already uses.
    alias: { '@': import.meta.dirname },
  },
  test: {
    // Only pure logic is covered: evaluator/scoring helpers and read-only
    // deployment checks. Anything that needs Supabase or a browser is left to
    // manual checking until there is a fixture database to point at.
    include: ['lib/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
})
