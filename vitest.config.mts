import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Same '@/...' alias tsconfig.json gives the app, so tests import modules
    // by the path the source already uses.
    alias: { '@': import.meta.dirname },
  },
  test: {
    // Pure logic, synthetic HTTP/adapter tests, and isolated PGlite SQL tests.
    // These do not exercise live Supabase Auth/RLS, browser mutations, native
    // SEB, or a running SEB Server; those require separate integration checks.
    include: ['lib/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
})
