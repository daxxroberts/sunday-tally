/**
 * Dump the full proposed_mapping JSON for an import job.
 * Usage: node scripts/dump-import-job.mjs <job_id>
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
    .split('\n').filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const jobId = process.argv[2]
if (!jobId) { console.error('Usage: node dump-import-job.mjs <job_id>'); process.exit(1) }

const { data: job, error } = await admin
  .from('import_jobs')
  .select('id, status, proposed_mapping')
  .eq('id', jobId)
  .single()
if (error || !job) { console.error(error?.message ?? 'not found'); process.exit(1) }

console.log('Job:', job.id, '| status:', job.status)
console.log('\n=== PROPOSED MAPPING ===\n')
console.log(JSON.stringify(job.proposed_mapping, null, 2))
