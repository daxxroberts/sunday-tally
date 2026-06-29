import type { ChartColorKey } from '@/components/charts/chartUtils'

/**
 * Blog chart data registry. MDX posts reference charts by a STRING id
 * (<StatGroup id="..."/> / <TrendChart id="..."/>) — string attrs are the only
 * props MDX reliably passes to client components on this stack, so the data
 * lives here in code rather than inline in the post. All numbers in illustrative
 * charts are clearly-labeled examples, never real church data (editorial bar).
 */

export type StatCardData = {
  label: string
  value: number | string
  delta?: number
  sub?: string
  prefix?: string
  suffix?: string
}

export type TrendData = {
  title?: string
  caption?: string
  index?: string
  categories: string[]
  colors?: ChartColorKey[]
  categoryLabels?: Record<string, string>
  prefix?: string
  suffix?: string
  fill?: 'gradient' | 'solid' | 'none'
  data: Record<string, unknown>[]
}

export const BLOG_STATS: Record<string, StatCardData[]> = {
  'attendance-divergence': [
    { label: 'Attendance (4-wk avg)', value: 312, delta: 2, sub: 'Holding steady all year' },
    { label: 'Giving (monthly)', value: 11600, prefix: '$', delta: -14, sub: 'Down from $13,500 a year ago' },
    { label: 'Volunteers serving', value: 41, delta: -18, sub: 'Down from 50 last year' },
  ],
}

export const BLOG_TRENDS: Record<string, TrendData> = {
  'attendance-reassuring-line': {
    title: 'Weekly attendance — the reassuring line',
    caption:
      'Illustrative example. The total never flinches, while giving and serving quietly slide beneath it.',
    categories: ['attendance'],
    colors: ['blue'],
    categoryLabels: { attendance: 'Attendance' },
    data: [
      { month: 'Jul', attendance: 309 },
      { month: 'Aug', attendance: 312 },
      { month: 'Sep', attendance: 316 },
      { month: 'Oct', attendance: 311 },
      { month: 'Nov', attendance: 314 },
      { month: 'Dec', attendance: 305 },
      { month: 'Jan', attendance: 313 },
      { month: 'Feb', attendance: 316 },
      { month: 'Mar', attendance: 312 },
      { month: 'Apr', attendance: 315 },
      { month: 'May', attendance: 313 },
      { month: 'Jun', attendance: 312 },
    ],
  },
}
