/**
 * backfill-grid-config.mjs
 * Derives and persists grid_config for any church that has active templates
 * with primary tags but null grid_config. Runs via the same deriveGridConfigFromSchema
 * logic that Stage B uses.
 *
 * Run: node scripts/backfill-grid-config.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Find churches with null grid_config but active templates with primary tags
const { data: churches } = await admin
  .from('churches')
  .select('id, name')
  .is('grid_config', null)

if (!churches?.length) {
  console.log('No churches with null grid_config found.')
  process.exit(0)
}

for (const church of churches) {
  // Check if church has active templates with primary tags
  const { data: templates } = await admin
    .from('service_templates')
    .select('id, display_name, primary_tag_id, service_code')
    .eq('church_id', church.id)
    .eq('is_active', true)
    .not('primary_tag_id', 'is', null)

  if (!templates?.length) {
    console.log(`${church.name} (${church.id.slice(0,8)}) — skipped (no active tagged templates)`)
    continue
  }

  console.log(`${church.name} (${church.id.slice(0,8)}) — deriving grid_config for ${templates.length} template(s)...`)

  // Replicate deriveGridConfigFromSchema logic here
  const { data: cats } = await admin
    .from('response_categories')
    .select('id, category_code, display_name, stat_scope, audience_groups')
    .eq('church_id', church.id)
    .eq('is_active', true)

  const { data: sources } = await admin
    .from('giving_sources')
    .select('id, source_code, display_name')
    .eq('church_id', church.id)
    .eq('is_active', true)

  const { data: volCats } = await admin
    .from('volunteer_categories')
    .select('id, category_code, display_name, audience_group_code')
    .eq('church_id', church.id)
    .eq('is_active', true)

  const { data: tags } = await admin
    .from('service_tags')
    .select('id, tag_code, display_name')
    .eq('church_id', church.id)

  const { data: schedules } = await admin
    .from('service_schedule_versions')
    .select('service_template_id, day_of_week, start_time, effective_from')
    .in('service_template_id', templates.map(t => t.id))
    .eq('is_active', true)

  const tagById = new Map((tags ?? []).map(t => [t.id, t]))
  const schedByTemplate = new Map()
  for (const s of schedules ?? []) {
    const existing = schedByTemplate.get(s.service_template_id)
    if (!existing || s.effective_from > existing.effective_from) {
      schedByTemplate.set(s.service_template_id, s)
    }
  }

  const serviceColumns = templates.map(t => {
    const tag = tagById.get(t.primary_tag_id)
    const sched = schedByTemplate.get(t.id)
    return {
      id:          t.service_code,
      label:       t.display_name,
      tag_code:    tag?.tag_code ?? null,
      day_of_week: sched?.day_of_week ?? 0,
      start_time:  sched?.start_time ?? null,
    }
  })

  // Build a minimal GridConfig matching the schema expected by HistoryGrid
  const gridConfig = {
    version:         1,
    service_columns: serviceColumns,
    row_groups: [
      {
        id:    'attendance',
        label: 'Attendance',
        rows: [
          { id: 'attendance.main',  label: 'Adults',   scope: 'service' },
          { id: 'attendance.kids',  label: 'Kids',     scope: 'service' },
          { id: 'attendance.youth', label: 'Students', scope: 'service' },
        ],
      },
      ...(volCats?.length ? [{
        id:    'volunteers',
        label: 'Volunteers',
        rows: (volCats ?? []).map(v => ({
          id:    `volunteer.${v.category_code}`,
          label: v.display_name,
          scope: 'service',
        })),
      }] : []),
      ...(cats?.filter(c => c.stat_scope === 'service' || c.stat_scope === 'audience').length ? [{
        id:    'stats',
        label: 'Stats',
        rows: (cats ?? [])
          .filter(c => c.stat_scope === 'service' || c.stat_scope === 'audience')
          .map(c => ({
            id:    `response.${c.category_code}`,
            label: c.display_name,
            scope: c.stat_scope,
          })),
      }] : []),
      ...(sources?.length ? [{
        id:    'giving',
        label: 'Giving',
        rows: (sources ?? []).map(s => ({
          id:    `period_giving.${s.source_code}`,
          label: s.display_name,
          scope: 'week',
        })),
      }] : []),
    ],
  }

  const { error: updateErr } = await admin
    .from('churches')
    .update({ grid_config: gridConfig })
    .eq('id', church.id)

  if (updateErr) {
    console.log(`  ✗ Failed to update: ${updateErr.message}`)
  } else {
    console.log(`  ✓ grid_config written (${serviceColumns.length} services, ${gridConfig.row_groups.length} row groups)`)
  }
}
