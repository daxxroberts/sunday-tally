import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAllRows, type SourceInput } from '@/lib/import/sources'
import { parseDateIso, parseCount, fmtMonthLabel } from '@/lib/import/parsers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ColumnMapEntry { source_column: string; dest_field: string }
interface SourceMapping {
  source_name:   string
  date_column?:  string
  column_map:    ColumnMapEntry[]
}

export interface MonthRow {
  month:  string   // YYYY-MM
  label:  string   // "Jan 2024"
  main:   number
  kids:   number
  youth:  number
  total:  number
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'no_church' }, { status: 403 })

  const body = await req.json() as { job_id: string; sources: SourceMapping[] }
  if (!body.job_id || !body.sources) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { data: job } = await supabase
    .from('import_jobs')
    .select('id, sources')
    .eq('id', body.job_id)
    .eq('church_id', membership.church_id)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const rawSources = (job.sources?.raw ?? []) as SourceInput[]
  const rawByName  = new Map(rawSources.map((s: SourceInput) => [s.name, s]))

  const monthMap = new Map<string, { main: number; kids: number; youth: number }>()

  for (const mapping of body.sources) {
    const raw = rawByName.get(mapping.source_name)
    if (!raw || raw.kind === 'text') continue

    const rows = await getAllRows(raw).catch(() => [] as Record<string, string>[])

    const fieldByCol = new Map(mapping.column_map.map(c => [c.source_column, c.dest_field]))
    const dateCol = mapping.date_column
      ?? [...fieldByCol.entries()].find(([, d]) => d === 'service_date')?.[0]
    if (!dateCol) continue

    for (const row of rows) {
      const iso = parseDateIso(row[dateCol])
      if (!iso) continue
      const month = iso.slice(0, 7)

      const bucket = monthMap.get(month) ?? { main: 0, kids: 0, youth: 0 }

      for (const [col, dest] of fieldByCol) {
        if (!dest.startsWith('attendance.')) continue
        const aud = dest.slice('attendance.'.length) as 'main' | 'kids' | 'youth'
        const n   = parseCount(row[col])
        if (n != null) bucket[aud] += n
      }
      monthMap.set(month, bucket)
    }
  }

  const months: MonthRow[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, c]) => ({
      month,
      label: fmtMonthLabel(month),
      main:  c.main,
      kids:  c.kids,
      youth: c.youth,
      total: c.main + c.kids + c.youth,
    }))

  return NextResponse.json({ months })
}
