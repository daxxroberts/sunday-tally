'use client'

/**
 * Reusable "Show: A / B / C" pill row that toggles top-level column groups.
 * Lives above a HistoryGrid and uses the same group-colors palette so the pill
 * for a group matches the column-header tint below it.
 *
 * Used by both the import review (PreviewGrid) and the History page so users
 * get a consistent way to hide/show ministry sections across the product.
 */

import type { GroupColor } from './group-colors'
import { extractRootKey } from './group-colors'

export interface GroupFilterOption {
  id:    string
  label: string
}

export interface GroupFilterPillsProps {
  options:       GroupFilterOption[]
  hiddenGroups:  Set<string>
  onToggle:      (groupId: string) => void
  colorMap:      Map<string, GroupColor>
  /** Optional label shown to the left of the pills. Defaults to "Show". */
  leadLabel?:    string
}

export function GroupFilterPills({
  options,
  hiddenGroups,
  onToggle,
  colorMap,
  leadLabel = 'Show',
}: GroupFilterPillsProps) {
  if (options.length === 0) return null
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0 flex-wrap">
      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-0.5">
        {leadLabel}
      </span>
      {options.map(opt => {
        const visible  = !hiddenGroups.has(opt.id)
        const colorKey = extractRootKey(opt.id)
        const color    = colorKey ? colorMap.get(colorKey) : undefined
        // Visible + color → pill takes the group's color. Visible + no color →
        // slate fallback (palette entries cycle, so this is rare). Hidden →
        // ghosted regardless of color so the off state is unmistakable.
        return (
          <button
            key={opt.id}
            onClick={() => onToggle(opt.id)}
            style={visible && color ? { backgroundColor: color.pillActive, color: color.pillActiveText } : undefined}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium',
              'transition-all duration-150 select-none',
              visible && !color
                ? 'bg-slate-800 text-white shadow-sm'
                : visible
                  ? 'shadow-sm'
                  : 'bg-white text-gray-400 border border-gray-200 hover:border-gray-300 hover:text-gray-500',
            ].join(' ')}
          >
            {visible && (
              <svg
                className="w-3 h-3 flex-shrink-0"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="2,6 5,9 10,3" />
              </svg>
            )}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
