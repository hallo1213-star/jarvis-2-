// Server-side configuration. Secrets (API keys) are read ONLY here, from environment
// variables or the git-ignored file `.env` in the project root. They are never sent to
// the browser and never written into job files.
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadDotEnv(file) {
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (!(key in process.env)) process.env[key] = val // real env vars win
  }
}
loadDotEnv(join(ROOT, '.env'))

const env = process.env
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v))

export const config = {
  host: env.VIDEO_SERVER_HOST || '127.0.0.1',
  port: num(env.VIDEO_SERVER_PORT || env.PORT, 8787),
  publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
  storageDir: resolve(ROOT, env.VIDEO_STORAGE_DIR || 'server/storage'),
  // Access tokens
  appToken: env.VIDEO_APP_TOKEN || '', // full access (confirm/cancel/delete) – your app
  intakeToken: env.VIDEO_INTAKE_TOKEN || '', // ChatGPT: may only submit + read jobs
  corsOrigins: (env.VIDEO_CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // Provider keys
  falKey: env.FAL_KEY || '',
  replicateToken: env.REPLICATE_API_TOKEN || '',
  // Cost guards (USD)
  maxCostPerJob: num(env.MAX_COST_PER_JOB_USD, 3),
  dailyBudget: num(env.DAILY_BUDGET_USD, 10),
  defaultProvider: env.VIDEO_DEFAULT_PROVIDER || '',
  defaultModel: env.VIDEO_DEFAULT_MODEL || '',
}

export const dirs = {
  videos: join(config.storageDir, 'videos'),
  uploads: join(config.storageDir, 'uploads'),
  tmp: join(config.storageDir, 'tmp'),
}
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
export const jobsFile = join(config.storageDir, 'jobs.json')
