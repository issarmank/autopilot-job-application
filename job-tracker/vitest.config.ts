import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { config } from 'dotenv'

// Load .env.local before any test file is imported so process.env.DATABASE_URL
// is available when src/db/index.ts creates its connection pool.
config({ path: '.env.local' })

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
