import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await admin
  .from('churches')
  .select('id, name, tracks_main_attendance, tracks_kids_attendance, tracks_youth_attendance, tracks_volunteers, tracks_responses, tracks_giving')
  .order('created_at', { ascending: false })

if (error) { console.error(error); process.exit(1) }

for (const c of data ?? []) {
  const flags = [
    c.tracks_main_attendance  ? 'main' : '',
    c.tracks_kids_attendance  ? 'kids' : '',
    c.tracks_youth_attendance ? 'youth' : '',
    c.tracks_volunteers       ? 'vols' : '',
    c.tracks_responses        ? 'resp' : '',
    c.tracks_giving           ? 'giving' : '',
  ].filter(Boolean)
  console.log(`${c.name} (${c.id.slice(0,8)}) tracks: [${flags.join(', ') || 'NONE'}]`)
}
