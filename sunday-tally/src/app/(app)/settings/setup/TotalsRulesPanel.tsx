'use client'

// TOTALS RULES PANEL — /settings/setup?tab=totals
//
// Each total rule says:
//   - what it adds up (Attendance, Volunteers, etc.)
//   - which ministries are counted (granular tree picker — ministry > classes)
//   - how it rolls up (weekly average or running total)
//   - whether it is the headline grand total
//
// Ministry picker: tristate checkbox tree. Checking a parent checks all its
// classes. Unchecking a single class removes it from the total while the
// parent becomes indeterminate. Saved to TotalRule.ministries as 'all' or
// string[] of included tag IDs.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveChurchPrefs } from '@/lib/churchPrefs'
import {
  resolveTotals,
  REPORTING_TYPES,
  REPORTING_TYPE_LABEL,
  type TotalRule,
  type ReportingType,
} from '@/lib/totals'

// ─── Ministry tree ─────────────────────────────────────────────────────────

interface MinTag {
  id: string
  name: string
  parent_tag_id: string | null
}

interface TreeNode {
  tag: MinTag
  children: TreeNode[]
}

function buildTree(tags: MinTag[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const t of tags) byId.set(t.id, { tag: t, children: [] })
  const roots: TreeNode[] = []
  for (const t of tags) {
    const node = byId.get(t.id)!
    if (t.parent_tag_id && byId.has(t.parent_tag_id)) {
      byId.get(t.parent_tag_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function allIds(node: TreeNode): string[] {
  if (node.children.length === 0) return [node.tag.id]
  return [node.tag.id, ...node.children.flatMap(allIds)]
}

type CheckState = 'checked' | 'unchecked' | 'indeterminate'

function nodeState(node: TreeNode, checked: Set<string>): CheckState {
  const ids = allIds(node)
  const n = ids.filter(id => checked.has(id)).length
  if (n === ids.length) return 'checked'
  if (n === 0) return 'unchecked'
  return 'indeterminate'
}

function toggleNode(node: TreeNode, checked: Set<string>): Set<string> {
  const ids = allIds(node)
  const state = nodeState(node, checked)
  const next = new Set(checked)
  if (state === 'checked') {
    for (const id of ids) next.delete(id)
  } else {
    for (const id of ids) next.add(id)
  }
  return next
}

// ─── Tristate checkbox ─────────────────────────────────────────────────────

function TriCheckbox({
  state,
  onChange,
  disabled,
}: {
  state: CheckState
  onChange: () => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'indeterminate'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'checked'}
      onChange={onChange}
      disabled={disabled}
      className="h-4 w-4 cursor-pointer rounded accent-[#4F6EF7] disabled:cursor-default"
    />
  )
}

// ─── Single tree row (recursive) ───────────────────────────────────────────

function TreeRow({
  node,
  checked,
  expanded,
  depth,
  onToggle,
  onExpand,
  disabled,
}: {
  node: TreeNode
  checked: Set<string>
  expanded: Set<string>
  depth: number
  onToggle: (n: TreeNode) => void
  onExpand: (id: string) => void
  disabled: boolean
}) {
  const hasChildren = node.children.length > 0
  const isExpanded = expanded.has(node.tag.id)
  const state = nodeState(node, checked)

  return (
    <>
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onExpand(node.tag.id)}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-400 hover:text-slate-700"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
              <path d="M6 4l4 4-4 4V4z" />
            </svg>
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <TriCheckbox state={state} onChange={() => onToggle(node)} disabled={disabled} />
        <span className={`text-sm ${state === 'unchecked' ? 'text-slate-400' : 'text-slate-800'}`}>
          {node.tag.name}
        </span>
        {hasChildren && (
          <span className="ml-1 text-[11px] text-slate-400">
            {node.children.filter(c => checked.has(c.tag.id)).length}/{node.children.length}
          </span>
        )}
      </div>
      {hasChildren && isExpanded && node.children.map(child => (
        <TreeRow
          key={child.tag.id}
          node={child}
          checked={checked}
          expanded={expanded}
          depth={depth + 1}
          onToggle={onToggle}
          onExpand={onExpand}
          disabled={disabled}
        />
      ))}
    </>
  )
}

// ─── Ministry tree picker ──────────────────────────────────────────────────

function MinistryTreePicker({
  tree,
  allTagIds,
  value,
  onChange,
  disabled,
}: {
  tree: TreeNode[]
  allTagIds: string[]
  value: 'all' | string[]
  onChange: (v: 'all' | string[]) => void
  disabled: boolean
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)

  const checked = useMemo<Set<string>>(() => {
    if (value === 'all') return new Set(allTagIds)
    return new Set(value)
  }, [value, allTagIds])

  function handleToggle(node: TreeNode) {
    const next = toggleNode(node, checked)
    onChange(next.size === allTagIds.length ? 'all' : [...next])
  }

  function handleExpand(id: string) {
    setExpanded(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  function handleSelectAll() {
    onChange('all')
  }

  function handleClearAll() {
    onChange([])
  }

  const checkedCount = checked.size
  const total = allTagIds.length

  if (total === 0) {
    return (
      <p className="text-[12px] text-slate-400">
        No ministries set up yet — add them in the What we track tab.
      </p>
    )
  }

  const summaryLabel = checkedCount === total
    ? 'All ministries'
    : checkedCount === 0
    ? 'No ministries'
    : `${checkedCount} of ${total} ministries`

  return (
    <div>
      {/* Summary row + toggle */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-slate-600 hover:bg-slate-50"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>
          <path d="M6 4l4 4-4 4V4z" />
        </svg>
        <span className={checkedCount === 0 ? 'text-amber-600' : ''}>{summaryLabel}</span>
        {!disabled && (
          <span className="ml-auto text-[11px] font-normal text-slate-400">
            {open ? 'collapse' : 'edit'}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {/* Select all / clear */}
          {!disabled && (
            <div className="mb-1 flex gap-3 border-b border-slate-200 px-2 pb-1.5 pt-0.5">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={checkedCount === total}
                className="text-[11px] font-semibold text-[#4F6EF7] disabled:opacity-40 hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={checkedCount === 0}
                className="text-[11px] font-semibold text-slate-400 disabled:opacity-40 hover:underline"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Tree */}
          <div className="max-h-64 overflow-y-auto">
            {tree.map(root => (
              <TreeRow
                key={root.tag.id}
                node={root}
                checked={checked}
                expanded={expanded}
                depth={0}
                onToggle={handleToggle}
                onExpand={handleExpand}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main panel ────────────────────────────────────────────────────────────

const MANAGER_ROLES = new Set(['owner', 'admin'])

export function TotalsRulesPanel({ embedded = false }: { embedded?: boolean }) {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [churchId, setChurchId] = useState<string | null>(null)
  const [basePrefs, setBasePrefs] = useState<Record<string, unknown>>({})
  const [rules, setRules] = useState<TotalRule[]>([])
  const [allTags, setAllTags] = useState<MinTag[]>([])
  const [tree, setTree] = useState<TreeNode[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const allTagIds = useMemo(() => allTags.map(t => t.id), [allTags])

  const loadTags = useCallback(async (cid: string) => {
    const { data } = await supabase
      .from('service_tags')
      .select('id, name, parent_tag_id')
      .eq('church_id', cid)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .range(0, 999)
    const tags = ((data ?? []) as MinTag[])
    setAllTags(tags)
    setTree(buildTree(tags))
  }, [supabase])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: membership } = await supabase
        .from('church_memberships')
        .select('role, church_id')
        .eq('user_id', user.id).eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1).maybeSingle()
      if (!membership) { setLoading(false); return }
      setCanEdit(MANAGER_ROLES.has(membership.role as string))
      setChurchId(membership.church_id as string)
      const { data: church } = await supabase
        .from('churches').select('dashboard_prefs').eq('id', membership.church_id).maybeSingle()
      const prefs = (church?.dashboard_prefs && typeof church.dashboard_prefs === 'object')
        ? (church.dashboard_prefs as Record<string, unknown>)
        : {}
      setBasePrefs(prefs)
      setRules(resolveTotals(prefs))
      await loadTags(membership.church_id as string)
      setLoading(false)
    })()
  }, [supabase, loadTags])

  function patch(id: string, change: Partial<TotalRule>) {
    setRules(rs => rs.map(r => r.id === id ? { ...r, ...change } : r))
    setDirty(true); setSavedAt(null)
  }

  function toggleType(id: string, t: ReportingType) {
    setRules(rs => rs.map(r => {
      if (r.id !== id) return r
      const has = r.reportingTypes.includes(t)
      const next = has ? r.reportingTypes.filter(x => x !== t) : [...r.reportingTypes, t]
      return { ...r, reportingTypes: next.length ? next : r.reportingTypes }
    }))
    setDirty(true); setSavedAt(null)
  }

  function setPrimary(id: string) {
    setRules(rs => rs.map(r => ({ ...r, isPrimary: r.id === id })))
    setDirty(true); setSavedAt(null)
  }

  function addTotal() {
    const id = `total_${Date.now()}`
    setRules(rs => [
      ...rs,
      { id, name: 'New total', reportingTypes: ['ATTENDANCE'], ministries: 'all', rollup: 'weekly_avg' },
    ])
    setDirty(true); setSavedAt(null)
  }

  function removeTotal(id: string) {
    setRules(rs => {
      const next = rs.filter(r => r.id !== id)
      if (next.length && !next.some(r => r.isPrimary)) next[0] = { ...next[0], isPrimary: true }
      return next
    })
    setDirty(true); setSavedAt(null)
  }

  async function save() {
    if (!churchId) return
    setSaving(true); setError(null)
    const next = { ...basePrefs, totals: rules }
    const res = await saveChurchPrefs(supabase, churchId, next)
    setSaving(false)
    if (!res.ok) { setError(res.message ?? 'Could not save'); return }
    setBasePrefs(next)
    setDirty(false); setSavedAt(Date.now())
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-400">Loading…</div>
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6" style={{ fontFamily: embedded ? undefined : "'Fira Sans', ui-sans-serif, system-ui, sans-serif" }}>
      <div className="mb-5">
        <h2 className="text-base font-bold text-slate-900">Grand total rules</h2>
        <p className="mt-1 text-sm text-slate-500">
          Tell Sunday Tally exactly what each total adds up. Choose which ministries and classes
          count toward each total — check a ministry to include everything under it, or expand
          and uncheck individual classes.
        </p>
      </div>

      <div className="space-y-3">
        {rules.map(r => (
          <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

            {/* Name + primary + remove */}
            <div className="flex items-center gap-2">
              <input
                value={r.name}
                disabled={!canEdit}
                onChange={e => patch(r.id, { name: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-sm font-bold text-slate-900 hover:border-slate-200 focus:border-[#4F6EF7] focus:outline-none disabled:hover:border-transparent"
                aria-label="Total name"
              />
              <label className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${r.isPrimary ? 'bg-amber-50 text-amber-700' : 'text-slate-400'}`}>
                <input
                  type="radio"
                  name="primary-total"
                  checked={!!r.isPrimary}
                  disabled={!canEdit}
                  onChange={() => setPrimary(r.id)}
                  className="accent-[#D4A017]"
                />
                Grand total
              </label>
              {canEdit && rules.length > 1 && (
                <button
                  onClick={() => removeTotal(r.id)}
                  aria-label={`Remove ${r.name}`}
                  className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Reporting types */}
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Adds up</div>
              <div className="flex flex-wrap gap-1.5">
                {REPORTING_TYPES.map(t => {
                  const on = r.reportingTypes.includes(t)
                  return (
                    <button
                      key={t}
                      disabled={!canEdit}
                      onClick={() => toggleType(r.id, t)}
                      className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                        on
                          ? 'border-[#4F6EF7] bg-[#4F6EF7]/10 text-[#4F6EF7]'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      } disabled:opacity-60`}
                    >
                      {REPORTING_TYPE_LABEL[t]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Roll-up */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Shown as</span>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-[13px]">
                {(['weekly_avg', 'sum'] as const).map(roll => (
                  <button
                    key={roll}
                    disabled={!canEdit}
                    onClick={() => patch(r.id, { rollup: roll })}
                    className={`px-3 py-1 font-medium transition-colors ${
                      r.rollup === roll ? 'bg-[#4F6EF7] text-white' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {roll === 'weekly_avg' ? 'Weekly average' : 'Running total'}
                  </button>
                ))}
              </div>
            </div>

            {/* Ministry tree picker */}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Counted from</div>
              <MinistryTreePicker
                tree={tree}
                allTagIds={allTagIds}
                value={r.ministries}
                onChange={v => patch(r.id, { ministries: v })}
                disabled={!canEdit}
              />
            </div>
          </div>
        ))}
      </div>

      {canEdit && (
        <button
          onClick={addTotal}
          className="mt-3 w-full rounded-2xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-500 hover:border-[#4F6EF7] hover:text-[#4F6EF7]"
        >
          + Add a total
        </button>
      )}

      {/* Save bar */}
      {canEdit && (
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-xl bg-[#4F6EF7] px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save totals'}
          </button>
          {savedAt && !dirty && <span className="text-[13px] text-emerald-600">Saved ✓</span>}
          {error && <span className="text-[13px] text-amber-600">{error}</span>}
        </div>
      )}
      {!canEdit && (
        <p className="mt-4 text-[13px] text-slate-400">Only owners and admins can change the total rules.</p>
      )}
    </div>
  )
}
