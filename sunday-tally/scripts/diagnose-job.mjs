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
const { data, error } = await admin.from('import_jobs').select('*').eq('id', jobId).single()
if (error) { console.error(error); process.exit(1) }
console.log('status:', data.status)
console.log('error:', data.error)
console.log('proposed_mapping is null:', data.proposed_mapping === null)
console.log('updated_at:', data.updated_at)
console.log()
// Check ai_usage rows for this job
const { data: usage } = await admin
  .from('ai_usage')
  .select('kind, model, cents, input_tokens, output_tokens, created_at')
  .order('created_at', { ascending: true })
  .limit(20)
console.log(`Recent ai_usage rows (last 20):`)
for (const r of usage ?? []) {
  console.log(`  ${r.created_at?.slice(11, 19)} ${r.kind?.padEnd(16)} ${r.model?.padEnd(28)} ${r.cents}¢  in=${r.input_tokens} out=${r.output_tokens}`)
}
