/**
 * Order-based color assignment for top-level column groups.
 *
 * The grid + filter pills must use IDENTICAL colors for the same group so the
 * user can visually associate a pill at the top of the page with the matching
 * column header below. To stay dynamic across churches (one church's parent
 * might be "Worship", another's "Experience", another's "Gathering"), we DO NOT
 * hardcode `experience → amber`. Instead the palette is positional — the first
 * top-level group in config order gets palette[0], the second gets palette[1],
 * and so on. The mapping is stable for any given config.
 */

export interface GroupColor {
  /** Background for the level-0 (strongest) group header. */
  strong: string
  /** Background for level-1 sub-group headers — lighter hue of the parent color. */
  light: string
  /** Text color that reads well on top of `strong`. */
  text: string
  /** Pill background when active (matches `strong`). */
  pillActive: string
  /** Pill text color when active. */
  pillActiveText: string
}

/**
 * Fixed palette. 8 entries — enough for any realistic church. Cycles if exceeded.
 * Order chosen so the first few entries pair well with the dark slate UI chrome.
 *
 * Position 0: deep blue       (typical: giving — money is the universal first thing)
 * Position 1: amber/gold      (typical: the primary worship service)
 * Position 2: emerald         (typical: kids ministry — green = growth)
 * Position 3: fuchsia/purple  (typical: youth — energetic)
 * Position 4: teal
 * Position 5: rose
 * Position 6: indigo
 * Position 7: orange
 */
const PALETTE: GroupColor[] = [
  { strong: '#1d4ed8', light: '#3b5fd1cc', text: '#dbeafe', pillActive: '#1d4ed8', pillActiveText: '#ffffff' },
  { strong: '#b45309', light: '#c2820acc', text: '#fef3c7', pillActive: '#b45309', pillActiveText: '#ffffff' },
  { strong: '#047857', light: '#10b981cc', text: '#d1fae5', pillActive: '#047857', pillActiveText: '#ffffff' },
  { strong: '#7e22ce', light: '#a855f7cc', text: '#f3e8ff', pillActive: '#7e22ce', pillActiveText: '#ffffff' },
  { strong: '#0f766e', light: '#14b8a6cc', text: '#ccfbf1', pillActive: '#0f766e', pillActiveText: '#ffffff' },
  { strong: '#be185d', light: '#ec4899cc', text: '#fce7f3', pillActive: '#be185d', pillActiveText: '#ffffff' },
  { strong: '#4338ca', light: '#6366f1cc', text: '#e0e7ff', pillActive: '#4338ca', pillActiveText: '#ffffff' },
  { strong: '#c2410c', light: '#ea580ccc', text: '#fed7aa', pillActive: '#c2410c', pillActiveText: '#ffffff' },
]

/**
 * Extracts the "root key" from a groupId so sub-groups inherit their parent's color.
 * Group IDs follow `group_<tag>` or `group_<tag>_<subkind>`. We take the segment
 * AFTER `group_` and BEFORE the next `_` — that's the parent tag identifier.
 *
 *   group_experience          → "experience"
 *   group_experience_stats    → "experience"
 *   group_lifekids_volunteers → "lifekids"
 */
export function extractRootKey(groupId: string | undefined): string | null {
  if (!groupId) return null
  const parts = groupId.replace(/^group_/, '').toLowerCase().split('_')
  return parts[0] || null
}

/**
 * Builds a Map<rootKey, GroupColor> based on the ORDER top-level groups appear
 * in the config. Stable for a given list of group IDs.
 *
 * If more groups exist than palette entries, the assignment wraps around the
 * palette (a 9th group would get palette[0]'s color, etc.).
 */
export function buildGroupColorMap(topLevelGroupIds: string[]): Map<string, GroupColor> {
  const map = new Map<string, GroupColor>()
  let nextIdx = 0
  for (const groupId of topLevelGroupIds) {
    const key = extractRootKey(groupId)
    if (!key || map.has(key)) continue
    map.set(key, PALETTE[nextIdx % PALETTE.length])
    nextIdx++
  }
  return map
}

/**
 * Resolve the inline style for a group header cell. Level 0 gets the strong
 * color; level 1 gets the lighter hue. Leaf cells get nothing (default gray).
 */
export function styleForGroup(
  groupId: string | undefined,
  level: number,
  colorMap: Map<string, GroupColor>,
): React.CSSProperties {
  const key = extractRootKey(groupId)
  if (!key) return {}
  const entry = colorMap.get(key)
  if (!entry) return {}
  if (level === 0) {
    return { backgroundColor: entry.strong, color: entry.text, borderBottomColor: entry.strong }
  }
  if (level === 1) {
    return { backgroundColor: entry.light, color: entry.text }
  }
  return {}
}
