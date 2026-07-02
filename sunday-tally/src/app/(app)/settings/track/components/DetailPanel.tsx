'use client'

// ─────────────────────────────────────────────────────────────────────────
// DetailPanel — the selected node's counts (mirrored-metrics editor).
//
// A MINISTRY (no parent):
//   • no groups yet → one plain list of its counts ("Counted in {ministry}"),
//     with an add. (Every count here is a ministry_only count.)
//   • has groups → two ordered sections:
//       1. "Counted in {ministry} as a whole"  (ministry_only)
//       2. "Counted in every group · added up here"  (template) — sits directly
//          above the groups list; each mirrors into every group, locked.
//     then the "Groups inside {ministry}" list + "Add a group inside".
//
// A GROUP (parent_tag_id set):
//   1. "from {ministry}"     (mirror — ghosted + locked; edited on the ministry)
//   2. "just for {group}"    (group_only)
//   "Add a group inside" is HIDDEN (groups don't nest — depth cap 2).
//
// Archived counts (archived_at set) are hidden here. No roll-up equation or
// running total in the editor — the "· added up here" label is the only cue.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import InlineEditField from '@/components/shared/InlineEditField'
import { Tooltip } from '@/components/shared/Tooltip'
import { Ico, roleLabel } from '@/app/(app)/entries/ui'
import type { GroupColor } from '@/components/history-grid/group-colors'
import type { TagRole, MetricRole } from '../actions'
import {
  ROLE_OPTIONS, rolePillClasses, KIND_LABEL,
  type KindCode, type Metric, type Ministry, type ReportingTag,
} from '../types'
import { AddMetricControl } from './AddMetricControl'
import { MetricRowItem } from './MetricRowItem'

// Who-are-you-counting lives only on people counts: Attendance & Volunteers.
const DEMOGRAPHIC_KINDS = new Set<string>(['ATTENDANCE', 'VOLUNTEERS'])

// A titled count list card (header + rows + optional add affordance).
// Module-scoped (not created during render) so its subtree keeps identity.
// `action` renders on the FAR RIGHT of the header band (e.g. a "+ Add" button);
// `add` renders the controlled add form in the card body, below the rows.
function SectionCard({
  title, hint, rows, add, action,
}: {
  title: string
  hint?: string
  rows: React.ReactNode
  add?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-2.5">
        <div className="min-w-0">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
          {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
        </div>
        {action}
      </div>
      {rows}
      {add && <div className="border-t border-slate-100 px-5 py-3">{add}</div>}
    </div>
  )
}

// Compact "+ Add" button for a section header band's far right.
function AddButton({ onClick, title }: { onClick: () => void; title?: string }) {
  const btn = (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#3D5BD4] transition-colors hover:bg-white"
    >
      <Ico.plus className="h-3.5 w-3.5" /> Add
    </button>
  )
  return title ? <Tooltip text={title}>{btn}</Tooltip> : btn
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-5 py-4 text-[13px] text-slate-400">{text}</p>
}

export function DetailPanel({
  ministry, write, metricsForNode, childNodes, reportingTags, color,
  ministryNameById,
  onSelectChild, onAddGroupHere,
  onRename, onRoleChange, onColorChange, onDeactivate,
  onAddCount, onRenameMetric, onRemoveMetric, onSetDemographic, onMoveSection,
}: {
  ministry: Ministry
  write: boolean
  metricsForNode: Metric[]
  childNodes: Ministry[]
  reportingTags: ReportingTag[]
  color?: GroupColor
  /** id → ministry/group name, for a group's "from {ministry}" note. */
  ministryNameById: Map<string, string>
  onSelectChild: (id: string) => void
  onAddGroupHere: (name: string, role: TagRole) => void
  onRename: (name: string) => Promise<void>
  onRoleChange: (role: TagRole) => Promise<void>
  /** Ministry color (0040) — top-level nodes only; null = back to the palette. */
  onColorChange: (color: string | null) => Promise<void>
  onDeactivate: () => void
  /** Section-scoped add. `role` is fixed by which section the add came from. */
  onAddCount: (role: MetricRole, kind: KindCode, name: string) => Promise<void>
  onRenameMetric: (metricId: string, name: string) => Promise<void>
  onRemoveMetric: (metricId: string) => Promise<void>
  onSetDemographic: (metricId: string, demographic: TagRole | null) => Promise<void>
  /** Move a ministry count between "at the ministry" and "every group". */
  onMoveSection: (metricId: string) => void
}) {
  const [addingGroup, setAddingGroup] = useState(false)
  const [gName, setGName] = useState('')
  const [gRole, setGRole] = useState<TagRole>(ministry.tag_role)
  // Which section's "+ Add" form is open (only one at a time across the panel).
  const [openAdd, setOpenAdd] = useState<'ministry_only' | 'template' | 'group_only' | null>(null)

  const isGroup = ministry.parent_tag_id !== null
  const hasGroups = childNodes.length > 0
  const accent = color?.strong ?? '#4F6EF7'
  const isHex = /^#[0-9a-fA-F]{6}$/.test(accent)
  // Three ascending tints of the ministry's base color, so each band reads as
  // "part of this ministry" while staying visually distinct — lightest to
  // strongest: Ministry Counts < Counted in every subgroup < Subgroups (top).
  const tint = (alphaHex: string, fallbackAlpha: number) =>
    isHex ? `${accent}${alphaHex}` : `rgba(79,110,247,${fallbackAlpha})`
  const tintBand = tint('26', 0.15)        // Subgroups inside — top band, ~15%
  const tintMinistryCounts = tint('0D', 0.05)  // Ministry Counts — lightest, ~5%

  // reporting_tag_id → code, so each row knows whether to offer a demographic.
  const codeByRtId = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of reportingTags) map.set(r.id, r.code)
    return map
  }, [reportingTags])
  const showDemographicFor = (m: Metric) => DEMOGRAPHIC_KINDS.has(codeByRtId.get(m.reporting_tag_id) ?? '')

  // Live (non-archived) counts, split by role. archived_at !== null → hidden.
  const live = useMemo(() => metricsForNode.filter(m => m.is_active && !m.archived_at), [metricsForNode])
  const ministryOnly = useMemo(() => live.filter(m => m.metric_role === 'ministry_only'), [live])
  const templates = useMemo(() => live.filter(m => m.metric_role === 'template'), [live])
  const mirrors = useMemo(() => live.filter(m => m.metric_role === 'mirror'), [live])
  const groupOnly = useMemo(() => live.filter(m => m.metric_role === 'group_only'), [live])
  // Legacy safety: an 'entry' metric with no explicit role reads as a plain
  // ministry/group count so nothing ever goes invisible mid-migration.
  const plainCounts = useMemo(
    () => live.filter(m =>
      m.metric_role !== 'ministry_only' && m.metric_role !== 'template' &&
      m.metric_role !== 'mirror' && m.metric_role !== 'group_only'),
    [live],
  )

  const parentName = ministry.parent_tag_id ? (ministryNameById.get(ministry.parent_tag_id) ?? 'the ministry') : 'the ministry'

  // One row (drives MetricRowItem). `movable` shows the "move to every group"
  // link on ministry_only rows (only when this ministry actually has groups).
  const kindLabelFor = (m: Metric) => {
    const code = codeByRtId.get(m.reporting_tag_id)
    return (code && KIND_LABEL[code as KindCode]) || reportingTags.find(r => r.id === m.reporting_tag_id)?.name || ''
  }
  const renderRow = (m: Metric, opts?: { movable?: boolean }) => (
    <MetricRowItem
      key={m.id}
      metric={m}
      write={write}
      kindCode={codeByRtId.get(m.reporting_tag_id)}
      kindLabel={kindLabelFor(m)}
      showDemographic={showDemographicFor(m)}
      inheritedRole={ministry.tag_role}
      ministryName={parentName}
      onRename={name => onRenameMetric(m.id, name)}
      onRemove={() => onRemoveMetric(m.id)}
      onSetDemographic={d => onSetDemographic(m.id, d)}
      onMoveSection={opts?.movable ? () => onMoveSection(m.id) : undefined}
    />
  )

  return (
    <div className="space-y-4">
      {/* Header + (ministry only) Groups — one unified card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        {/* Identity band — full ministry color, white text. */}
        <div className="flex items-start gap-3 px-5 py-4" style={{ backgroundColor: accent }}>
          <div className="flex-1 min-w-0">
            <Tooltip
              className="cursor-help"
              text={isGroup
                ? 'This sits inside a ministry. You count it separately in Entries, and it adds up under the ministry on the dashboard.'
                : 'This is a ministry — it gets its own dashboard card with its own color. Everything inside it adds up here.'}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                {isGroup ? 'Subgroup' : 'Ministry'}
              </span>
            </Tooltip>
            {write ? (
              <InlineEditField value={ministry.name} onSave={onRename} aria-label="Ministry name" className="text-[17px] font-bold text-white" inputClassName="text-[17px] font-bold text-slate-900 bg-white rounded px-1" />
            ) : (
              <h2 className="text-[17px] font-bold text-white">{ministry.name}</h2>
            )}
            {/* Who it's for (role) + color — on the colored band */}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-white/70">Who it's for</span>
              {write ? (
                <Tooltip text="Who this ministry is for — Adults, Kids, Students, or Other. Sets the audience this ministry counts.">
                  <select value={ministry.tag_role} onChange={e => onRoleChange(e.target.value as TagRole)} aria-label="Who this ministry is for" className="rounded-md border border-white/40 bg-white/15 px-2 py-0.5 text-[12px] text-white outline-none focus:border-white [&>option]:text-slate-800">
                    {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Tooltip>
              ) : (
                <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white">{roleLabel(ministry.tag_role)}</span>
              )}
              {!isGroup && write && (
                <span className="ml-1 flex items-center gap-1.5">
                  <Tooltip text="This color follows the ministry everywhere — dashboard, Entries, History.">
                    <input
                      id="ministry-color"
                      type="color"
                      value={ministry.color ?? (color?.strong ?? '#4F6EF7')}
                      onChange={e => void onColorChange(e.target.value)}
                      className="h-6 w-7 cursor-pointer rounded border border-white/40 bg-white/15 p-0.5"
                    />
                  </Tooltip>
                  {ministry.color && (
                    <Tooltip text="Back to the automatic palette">
                      <button onClick={() => void onColorChange(null)} className="text-[11px] text-white/70 hover:text-white">Reset</button>
                    </Tooltip>
                  )}
                </span>
              )}
            </div>
          </div>
          {/* Remove — small, top-right */}
          {write && (
            <button onClick={onDeactivate} className="shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
              Remove
            </button>
          )}
        </div>

        {/* Subgroups inside {ministry} — the very top band, tinted ~15% of the
            ministry color. Ministries only (subgroups don't nest). */}
        {!isGroup && (childNodes.length > 0 || write) && (
          <>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-2.5" style={{ backgroundColor: tintBand }}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Subgroups inside {ministry.name}</h3>
              <div className="flex items-center gap-3">
                <span className="font-num text-[11px] font-semibold text-slate-500">{childNodes.length}</span>
                {write && !addingGroup && (
                  <Tooltip text={`A subgroup is a breakdown inside ${ministry.name}. New subgroups start with the same "every subgroup" counts as ${ministry.name}, so they all match — you count each one separately in Entries, and the dashboard adds them up under ${ministry.name} as one number.`}>
                    <button
                      onClick={() => { setAddingGroup(true); setGRole(ministry.tag_role) }}
                      className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#3D5BD4] transition-colors hover:bg-white"
                    >
                      <Ico.plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
            {childNodes.length > 0 && (
              <ul className="divide-y divide-slate-50">
                {childNodes.map(c => (
                  <li key={c.id}>
                    <button onClick={() => onSelectChild(c.id)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-slate-50">
                      <Ico.chevron className="h-3.5 w-3.5 -rotate-90 text-slate-300" />
                      <span className="text-[14px] font-medium text-slate-700">{c.name}</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${rolePillClasses()}`}>{roleLabel(c.tag_role)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {write && addingGroup && (
              <div className="border-t border-slate-100 px-5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text" value={gName} onChange={e => setGName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && gName.trim()) { onAddGroupHere(gName, gRole); setGName(''); setAddingGroup(false) } if (e.key === 'Escape') { setAddingGroup(false); setGName('') } }}
                    placeholder="Subgroup name (e.g. Tabors)" autoFocus
                    className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-900 placeholder-slate-400 outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30"
                  />
                  <select value={gRole} onChange={e => setGRole(e.target.value as TagRole)} aria-label="Subgroup role" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-[#4F6EF7]">
                    {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <button onClick={() => { if (gName.trim()) { onAddGroupHere(gName, gRole); setGName(''); setAddingGroup(false) } }} disabled={!gName.trim()} className="rounded-lg bg-[#4F6EF7] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3D5BD4] disabled:opacity-40">Add</button>
                  <button onClick={() => { setAddingGroup(false); setGName('') }} className="rounded-lg px-2 py-1.5 text-[13px] text-slate-400 transition-colors hover:text-slate-700">Cancel</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* MINISTRY with groups → "Counted in {ministry} as a whole" (ministry_only)
            sits directly under the identity, ABOVE the "every group" section.
            Also shown with zero subgroups if template counts still exist (e.g.
            the last subgroup was just removed) — the split view must survive
            that, or these counts (and the "every subgroup" ones below) would
            vanish from the editor entirely (review finding #42). */}
        {!isGroup && (hasGroups || templates.length > 0) && (
          <>
            <div className="flex items-start justify-between gap-3 border-t border-slate-100 px-5 py-2.5" style={{ backgroundColor: tintMinistryCounts }}>
              <div className="min-w-0">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Ministry Counts</h3>
                <p className="mt-0.5 text-[11px] text-slate-400">Counted once for {ministry.name} as a whole — not broken out by subgroup.</p>
              </div>
              {write && (
                <AddButton
                  onClick={() => setOpenAdd(openAdd === 'ministry_only' ? null : 'ministry_only')}
                  title={`Add a number counted once for all of ${ministry.name}, not broken out by subgroup.`}
                />
              )}
            </div>
            {(ministryOnly.length > 0 || plainCounts.length > 0) ? (
              <ul className="divide-y divide-slate-50">{[...ministryOnly, ...plainCounts].map(m => renderRow(m, { movable: true }))}</ul>
            ) : (
              <EmptyRow text={`Nothing counted for ${ministry.name} as a whole yet.`} />
            )}
            {write && openAdd === 'ministry_only' && (
              <div className="border-t border-slate-100 px-5 py-3">
                <AddMetricControl
                  open
                  onClose={() => setOpenAdd(null)}
                  reportingTags={reportingTags}
                  onAdd={(kind, name) => onAddCount('ministry_only', kind, name)}
                  panelTitle={`Add a count for ${ministry.name} as a whole`}
                  helpText={`This count is entered once for ${ministry.name}, not per subgroup.`}
                />
              </div>
            )}
          </>
        )}

        {/* MINISTRY with groups → the "Counted in every group" (template) section
            lives just ABOVE the group list, inside this same card. Same
            zero-subgroups survival as the section above (finding #42). */}
        {!isGroup && (hasGroups || templates.length > 0) && (
          <>
            <div className="flex items-start justify-between gap-3 border-t border-slate-100 bg-[#EEF1FE] px-5 py-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Counted in every subgroup</h3>
                <Tooltip className="mt-px flex items-center" text="Every subgroup will mirror these counts, so they can be shown on their entries page.">
                  <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 fill-slate-400" aria-hidden><path d="M0 0h10L5 6z" /></svg>
                </Tooltip>
              </div>
              {write && (
                <AddButton
                  onClick={() => setOpenAdd(openAdd === 'template' ? null : 'template')}
                  title={`Add a count that every subgroup inside ${ministry.name} tracks, totaled up under ${ministry.name}.`}
                />
              )}
            </div>
            {templates.length > 0 ? (
              <ul className="divide-y divide-slate-50">{templates.map(m => renderRow(m, { movable: true }))}</ul>
            ) : (
              <EmptyRow text={`Nothing counted in every subgroup yet — use "Add" above, or add a count under Ministry Counts then "Move to every subgroup."`} />
            )}
            {write && openAdd === 'template' && (
              <div className="border-t border-slate-100 px-5 py-3">
                <AddMetricControl
                  open
                  onClose={() => setOpenAdd(null)}
                  reportingTags={reportingTags}
                  onAdd={(kind, name) => onAddCount('template', kind, name)}
                  panelTitle="Add a count for every subgroup"
                  helpText={`Every subgroup inside ${ministry.name} will count this, and ${ministry.name} shows the total.`}
                />
              </div>
            )}
          </>
        )}

      </div>

      {/* ── Count sections ─────────────────────────────────────────────────── */}

      {isGroup ? (
        <>
          {/* GROUP · from {ministry} — locked mirrors (only if any). */}
          {mirrors.length > 0 && (
            <SectionCard
              title={`From ${parentName}`}
              hint="These come from the ministry — edit them there and every group updates together."
              rows={<ul className="divide-y divide-slate-50">{mirrors.map(m => renderRow(m))}</ul>}
            />
          )}

          {/* GROUP · just for {group} — its own local counts. */}
          <SectionCard
            title={`Just for ${ministry.name}`}
            action={write && (
              <AddButton
                onClick={() => setOpenAdd(openAdd === 'group_only' ? null : 'group_only')}
                title={`Add a number counted only in ${ministry.name}. It's entered here in Entries and isn't mirrored to the other subgroups.`}
              />
            )}
            rows={
              (groupOnly.length > 0 || plainCounts.length > 0)
                ? <ul className="divide-y divide-slate-50">{[...groupOnly, ...plainCounts].map(m => renderRow(m))}</ul>
                : <EmptyRow text={`Nothing counted just for ${ministry.name} yet.`} />
            }
            add={write && openAdd === 'group_only' && (
              <AddMetricControl
                open
                onClose={() => setOpenAdd(null)}
                reportingTags={reportingTags}
                onAdd={(kind, name) => onAddCount('group_only', kind, name)}
                panelTitle={`Add a count just for ${ministry.name}`}
                helpText={`This count is entered only for ${ministry.name} — it isn't shared with the other subgroups.`}
              />
            )}
          />
        </>
      ) : (hasGroups || templates.length > 0) ? null : (
        <>
          {/* MINISTRY, no groups and no template counts → a single plain list
              (all ministry_only). Once either exists, the split view above
              (Ministry Counts + Counted in every subgroup) takes over instead
              — this avoids double-rendering the same ministry_only rows. */}
          <SectionCard
            title="Ministry Counts"
            hint={`Counted for ${ministry.name}. Add a subgroup to break any of these out and total them up.`}
            action={write && (
              <AddButton
                onClick={() => setOpenAdd(openAdd === 'ministry_only' ? null : 'ministry_only')}
                title={`Add a number to count inside ${ministry.name}.`}
              />
            )}
            rows={
              (ministryOnly.length > 0 || plainCounts.length > 0)
                ? <ul className="divide-y divide-slate-50">{[...ministryOnly, ...plainCounts].map(m => renderRow(m))}</ul>
                : <EmptyRow text={`No counts in ${ministry.name} yet.`} />
            }
            add={write && openAdd === 'ministry_only' && (
              <AddMetricControl
                open
                onClose={() => setOpenAdd(null)}
                reportingTags={reportingTags}
                onAdd={(kind, name) => onAddCount('ministry_only', kind, name)}
                panelTitle={`Add a count to ${ministry.name}`}
                helpText={`This count lives inside ${ministry.name}. To break ${ministry.name} into subgroups that total up, add a subgroup first.`}
              />
            )}
          />
        </>
      )}
    </div>
  )
}
