'use client'

import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { ProposedSetup } from '@/lib/import/stageA_validate'
import type { PreviewData, ProposedSource } from '../types'
import { EntityRow } from './EntityRow'

// ── Section 2: Data Organisation ─────────────────────────────────────────────

export function Section2DataOrganisation({
  setup,
  entityCount,
  sources,
  previewData,
  anomalies,
  dashboardWarnings,
}: {
  setup?:             ProposedSetup
  entityCount:        number
  sources:            ProposedSource[]
  previewData?:       PreviewData | null
  anomalies?:         Array<{ kind: string; description: string }>
  dashboardWarnings?: string[]
}) {
  // metric_code → display name, for resolving `metric.<CODE>` dest_fields to labels.
  const metricNameByCode = new Map<string, string>()
  for (const m of setup?.metrics ?? []) metricNameByCode.set(m.metric_code, m.name ?? m.metric_code)

  const mappingCount = sources.reduce((n, s) => {
    const colCount = s.column_map.filter(c => c.dest_field !== 'ignore').length
    const mapCount = Object.keys(s.tall_format?.area_field_map ?? {}).length
    return n + colCount + mapCount
  }, 0)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-900">How your data is organised</h2>
        <p className="mt-0.5 text-sm text-gray-600">
          {entityCount} setup items · {mappingCount} metrics mapped
        </p>
      </div>

      {setup && entityCount > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            What we detected
          </p>
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
            {setup.locations?.map((l, i) => (
              <EntityRow key={`loc-${i}`} type="Location" name={l.name} />
            ))}
            {setup.ministry_tags?.map((t, i) => (
              <EntityRow key={`min-${i}`} type="Ministry" name={`${t.name ?? t.code}${t.tag_role ? ` · ${tagRoleLabel(t.tag_role)}` : ''}`} />
            ))}
            {setup.service_templates?.map((t, i) => (
              <EntityRow key={`tmpl-${i}`} type="Service" name={t.display_name === '[BLOCKING]' ? '(name needed)' : t.display_name} warn={t.display_name === '[BLOCKING]'} />
            ))}
            {setup.metrics?.map((m, i) => (
              <EntityRow key={`met-${i}`} type="Metric" name={`${m.name ?? m.metric_code}${m.reporting_tag ? ` · ${reportingTagLabel(m.reporting_tag)}` : ''}`} />
            ))}
          </div>
        </div>
      )}

      {previewData && previewData.monthly_attendance.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Monthly attendance
          </p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={previewData.monthly_attendance} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" fontSize={11} tick={{ fill: '#6b7280' }} interval="preserveStartEnd" />
                <YAxis fontSize={11} tick={{ fill: '#6b7280' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="main"  name="Main"     stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="kids"  name="Kids"     stroke="#059669" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="youth" name="Students" stroke="#d97706" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {previewData.note && (
            <p className="mt-2 text-xs text-gray-500">{previewData.note}</p>
          )}
        </div>
      ) : previewData === null ? (
        <p className="text-sm text-gray-500 italic">
          Trend chart will appear after import — not enough monthly data to preview.
        </p>
      ) : null}

      {sources.some(s => s.tall_format?.area_field_map && Object.keys(s.tall_format.area_field_map).length > 0) && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
            How your metrics are mapped
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  <th className="px-4 py-2.5">Your data</th>
                  <th className="px-4 py-2.5">Goes to metric</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sources.flatMap(s =>
                  Object.entries(s.tall_format?.area_field_map ?? {}).map(([key, dest], i) => (
                    <tr key={`${s.source_name}-${i}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{key}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-800">{destFieldLabel(dest, metricNameByCode)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {anomalies && anomalies.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Heads up</p>
          {anomalies.map((a, i) => (
            <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">{a.kind}</p>
              <p className="mt-1 text-sm text-gray-900">{a.description}</p>
            </div>
          ))}
        </div>
      )}

      {dashboardWarnings && dashboardWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900 mb-2">Dashboard notes</p>
          <ul className="space-y-1 text-sm text-amber-800">
            {dashboardWarnings.map((w, i) => <li key={i}>· {w}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

// IR v2: a dest_field is `metric.<METRIC_CODE>` (or `ignore`). Resolve it to the
// metric's display name via the supplied code→name map; fall back to the code.
function destFieldLabel(dest: string, metricNameByCode?: Map<string, string>): string {
  if (dest === 'ignore') return '(ignored)'
  if (dest.startsWith('metric.')) {
    const code = dest.slice('metric.'.length)
    return metricNameByCode?.get(code) ?? code.replace(/_/g, ' ')
  }
  return dest
}

function tagRoleLabel(role: string): string {
  switch (role) {
    case 'ADULT_SERVICE':  return 'Adult service'
    case 'KIDS_MINISTRY':  return 'Kids'
    case 'YOUTH_MINISTRY': return 'Youth'
    case 'OTHER':          return 'Other'
    default:               return role
  }
}

function reportingTagLabel(code: string): string {
  switch (code) {
    case 'ATTENDANCE':    return 'Attendance'
    case 'VOLUNTEERS':    return 'Volunteers'
    case 'GIVING':        return 'Giving'
    case 'RESPONSE_STAT': return 'Stats'
    default:              return code
  }
}
