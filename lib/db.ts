import { Pool } from 'pg'

// Giữ một pool duy nhất qua các lần hot-reload ở môi trường dev.
const globalForDb = globalThis as unknown as { pgPool?: Pool }

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Chưa cấu hình DATABASE_URL trong file .env.local')
  globalForDb.pgPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  })
  return globalForDb.pgPool
}
