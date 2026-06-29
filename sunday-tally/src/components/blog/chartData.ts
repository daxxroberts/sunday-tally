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
  'summer-dip-truth': [
    { label: '4-week average', value: 342, delta: -2, sub: 'Barely moved all summer' },
    { label: 'Lowest single Sunday', value: 291, sub: 'The scary number to ignore' },
  ],
  'giving-divergence': [
    { label: 'Total giving', value: 13700, prefix: '$', delta: 5, sub: 'Looks healthy on its own' },
    { label: 'Number of givers', value: 96, delta: -11, sub: 'Quietly shrinking' },
    { label: 'Giving per giver', value: 143, prefix: '$', delta: 18, sub: 'Fewer people carrying more' },
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
  'summer-noisy-vs-average': {
    title: 'The same summer, two ways of counting',
    caption:
      'Illustrative example. The raw weekly line looks alarming; the 4-week average barely moves.',
    index: 'week',
    categories: ['Weekly count', '4-week average'],
    colors: ['gray', 'blue'],
    fill: 'none',
    data: [
      { week: 'May 4', 'Weekly count': 358, '4-week average': 352 },
      { week: 'May 18', 'Weekly count': 365, '4-week average': 351 },
      { week: 'Jun 1', 'Weekly count': 310, '4-week average': 344 },
      { week: 'Jun 15', 'Weekly count': 318, '4-week average': 327 },
      { week: 'Jun 22', 'Weekly count': 291, '4-week average': 317 },
      { week: 'Jul 6', 'Weekly count': 305, '4-week average': 312 },
      { week: 'Jul 13', 'Weekly count': 351, '4-week average': 321 },
      { week: 'Jul 27', 'Weekly count': 347, '4-week average': 331 },
      { week: 'Aug 3', 'Weekly count': 358, '4-week average': 344 },
      { week: 'Aug 17', 'Weekly count': 356, '4-week average': 350 },
    ],
  },
  'kids-vs-adults': {
    title: 'Kids attendance leads, adult attendance lags',
    caption:
      "Illustrative example. The kids' line bends down months before the adult line follows.",
    index: 'month',
    categories: ['Kids', 'Adults'],
    colors: ['amber', 'blue'],
    fill: 'none',
    data: [
      { month: 'Jul', Kids: 120, Adults: 305 },
      { month: 'Aug', Kids: 118, Adults: 308 },
      { month: 'Sep', Kids: 122, Adults: 312 },
      { month: 'Oct', Kids: 112, Adults: 311 },
      { month: 'Nov', Kids: 104, Adults: 314 },
      { month: 'Dec', Kids: 98, Adults: 309 },
      { month: 'Jan', Kids: 95, Adults: 312 },
      { month: 'Feb', Kids: 90, Adults: 308 },
      { month: 'Mar', Kids: 86, Adults: 299 },
      { month: 'Apr', Kids: 82, Adults: 291 },
      { month: 'May', Kids: 80, Adults: 285 },
      { month: 'Jun', Kids: 78, Adults: 279 },
    ],
  },
  'volunteer-concentration': {
    title: 'The schedule stays full while fewer people carry it',
    caption:
      'Illustrative example. Slots filled holds steady while the number of unique volunteers falls — burnout forming in plain sight.',
    index: 'month',
    categories: ['Slots filled', 'Unique volunteers'],
    colors: ['blue', 'amber'],
    fill: 'none',
    data: [
      { month: 'Jan', 'Slots filled': 118, 'Unique volunteers': 46 },
      { month: 'Feb', 'Slots filled': 120, 'Unique volunteers': 45 },
      { month: 'Mar', 'Slots filled': 119, 'Unique volunteers': 43 },
      { month: 'Apr', 'Slots filled': 121, 'Unique volunteers': 40 },
      { month: 'May', 'Slots filled': 120, 'Unique volunteers': 37 },
      { month: 'Jun', 'Slots filled': 119, 'Unique volunteers': 34 },
    ],
  },
}
