// Chart color utilities — adapted from Tremor (Apache-2.0)

export type ColorUtility = 'bg' | 'stroke' | 'fill' | 'text'

export const chartColors = {
  blue:    { bg: 'bg-blue-500',    stroke: 'stroke-blue-500',    fill: 'fill-blue-500',    text: 'text-blue-500' },
  indigo:  { bg: 'bg-indigo-500',  stroke: 'stroke-indigo-500',  fill: 'fill-indigo-500',  text: 'text-indigo-500' },
  violet:  { bg: 'bg-violet-500',  stroke: 'stroke-violet-500',  fill: 'fill-violet-500',  text: 'text-violet-500' },
  emerald: { bg: 'bg-emerald-500', stroke: 'stroke-emerald-500', fill: 'fill-emerald-500', text: 'text-emerald-500' },
  amber:   { bg: 'bg-amber-500',   stroke: 'stroke-amber-500',   fill: 'fill-amber-500',   text: 'text-amber-500' },
  rose:    { bg: 'bg-rose-500',    stroke: 'stroke-rose-500',    fill: 'fill-rose-500',    text: 'text-rose-500' },
  cyan:    { bg: 'bg-cyan-500',    stroke: 'stroke-cyan-500',    fill: 'fill-cyan-500',    text: 'text-cyan-500' },
  fuchsia: { bg: 'bg-fuchsia-500', stroke: 'stroke-fuchsia-500', fill: 'fill-fuchsia-500', text: 'text-fuchsia-500' },
  lime:    { bg: 'bg-lime-500',    stroke: 'stroke-lime-500',    fill: 'fill-lime-500',    text: 'text-lime-500' },
  gray:    { bg: 'bg-gray-500',    stroke: 'stroke-gray-500',    fill: 'fill-gray-500',    text: 'text-gray-500' },
} as const satisfies { [color: string]: { [key in ColorUtility]: string } }

export type ChartColorKey = keyof typeof chartColors

export const defaultColors: ChartColorKey[] = Object.keys(chartColors) as ChartColorKey[]

export function constructCategoryColors(
  categories: string[],
  colors: ChartColorKey[],
): Map<string, ChartColorKey> {
  const map = new Map<string, ChartColorKey>()
  categories.forEach((cat, i) => map.set(cat, colors[i % colors.length]))
  return map
}

export function colorClass(color: ChartColorKey | undefined, type: ColorUtility): string {
  const fallback = { bg: 'bg-gray-500', stroke: 'stroke-gray-500', fill: 'fill-gray-500', text: 'text-gray-500' }
  return (color ? chartColors[color]?.[type] : null) ?? fallback[type]
}

// Tailwind 500 hex values — used for recharts Bar/Dot fill (SVG needs direct colors, not CSS classes)
const chartHex: Record<ChartColorKey, string> = {
  blue:    '#3b82f6',
  violet:  '#8b5cf6',
  emerald: '#10b981',
  amber:   '#f59e0b',
  rose:    '#f43f5e',
  cyan:    '#06b6d4',
  indigo:  '#6366f1',
  fuchsia: '#d946ef',
  lime:    '#84cc16',
  gray:    '#6b7280',
}

export function colorHex(color: ChartColorKey | undefined): string {
  return (color ? chartHex[color] : null) ?? '#6b7280'
}
