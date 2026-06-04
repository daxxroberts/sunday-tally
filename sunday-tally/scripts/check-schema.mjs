/**
 * check-schema.mjs — probe which columns exist on churches table
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Probe each tracking column individually
const cols = [
  'tracks_volunteers',
  'tracks_responses',
  'tracks_giving',
  'tracks_kids_attendance',
  'tracks_youth_attendance',
  'tracks_main_attendance',
  'grid_config',
]

for (const col of cols) {
  const { data, error } = await admin.from('churches').select(`id, ${col}`).limit(1)
  if (error) {
    console.log(`✗ ${col} — MISSING (${error.code}: ${error.message})`)
  } else {
    const val = data?.[0]?.[col]
    console.log(`✓ ${col} — exists (sample: ${JSON.stringify(val)})`)
  }
}
