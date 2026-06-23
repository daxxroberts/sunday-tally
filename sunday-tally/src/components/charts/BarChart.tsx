'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
// BarChart — Tremor-style, recharts v3 + Tailwind v4

import React from 'react'
import {
  Bar,
  CartesianGrid,
  Label,
  BarChart as RechartsBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  constructCategoryColors,
  colorClass,
  colorHex,
  defaultColors,
  type ChartColorKey,
} from './chartUtils'

// ── Tooltip (shared Tremor style) ─────────────────────────────────────────────

interface PayloadItem {
  category: string
  value: number
  color: ChartColorKey
}

interface ChartTooltipProps {
  active?: boolean
  payload?: PayloadItem[]
  label?: string
  valueFormatter: (value: number) => string
}

function ChartTooltip({ active, payload, label, valueFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white text-[13px] shadow-md">
      <div className="border-b border-slate-100 px-3 py-1.5">
        <p className="font-medium text-slate-900">{label}</p>
      </div>
      <div className="space-y-1 px-3 py-1.5">
        {payload.map(({ value, category, color }, i) => (
          <div key={i} className="flex items-center justify-between space-x-6">
            <div className="flex items-center space-x-2">
              <span
                aria-hidden
                className={`size-2.5 shrink-0 rounded-sm ${colorClass(color, 'bg')}`}
              />
              <p className="whitespace-nowrap text-slate-600">{category}</p>
            </div>
            <p className="whitespace-nowrap text-right font-medium tabular-nums text-slate-900">
              {valueFormatter(value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── BarChart ──────────────────────────────────────────────────────────────────

export interface BarChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: Record<string, unknown>[]
  index: string
  categories: string[]
  colors?: ChartColorKey[]
  valueFormatter?: (value: number) => string
  /** Optional formatter for Y-axis tick labels (defaults to valueFormatter — use a
   *  compact "1.2k" formatter so long numbers don't overflow a narrow axis). */
  yAxisFormatter?: (value: number) => string
  /** X-axis tick density: a number (show every Nth label) or a recharts preset.
   *  Pass 0 to show every label. */
  xAxisInterval?: number | 'preserveStart' | 'preserveEnd' | 'preserveStartEnd' | 'equidistantPreserveStart'
  /** Stack bars on top of each other instead of grouping side-by-side */
  stack?: boolean
  showXAxis?: boolean
  showYAxis?: boolean
  yAxisWidth?: number
  showGridLines?: boolean
  showTooltip?: boolean
  showLegend?: boolean
  allowDecimals?: boolean
  autoMinValue?: boolean
  minValue?: number
  maxValue?: number
  xAxisLabel?: string
  yAxisLabel?: string
  /** Optional formatter for x-axis tick labels */
  xAxisFormatter?: (value: string) => string
  /** Max bar size in px */
  maxBarSize?: number
}

export function BarChart({
  data = [],
  categories = [],
  index,
  colors = defaultColors,
  valueFormatter = (v) => String(v),
  yAxisFormatter,
  xAxisInterval,
  stack = false,
  showXAxis = true,
  showYAxis = true,
  yAxisWidth = 56,
  showGridLines = true,
  showTooltip = true,
  showLegend = true,
  allowDecimals = true,
  autoMinValue = false,
  minValue,
  maxValue,
  xAxisLabel,
  yAxisLabel,
  xAxisFormatter,
  maxBarSize = 40,
  className,
  ...rest
}: BarChartProps) {
  const categoryColors = constructCategoryColors(categories, colors)

  const yDomain: [number | string, number | string] = autoMinValue
    ? ['auto', maxValue ?? 'auto']
    : [minValue ?? 0, maxValue ?? 'auto']

  function Legend() {
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 pb-2">
        {categories.map((cat) => {
          const color = categoryColors.get(cat)
          return (
            <div key={cat} className="flex items-center gap-1.5">
              <span className={`size-2.5 shrink-0 rounded-sm ${colorClass(color, 'bg')}`} aria-hidden />
              <span className="text-xs text-gray-600 dark:text-gray-400">{cat}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={`h-80 w-full ${className ?? ''}`} {...rest}>
      {showLegend && <Legend />}
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          margin={{
            bottom: xAxisLabel ? 30 : undefined,
            left: yAxisLabel ? 20 : undefined,
            right: yAxisLabel ? 5 : undefined,
            top: 5,
          }}
          barCategoryGap="25%"
        >
          {showGridLines && (
            <CartesianGrid
              className="stroke-slate-100"
              horizontal
              vertical={false}
            />
          )}

          <XAxis
            hide={!showXAxis}
            dataKey={index}
            tick={{ transform: 'translate(0, 6)' }}
            fill=""
            stroke=""
            className="fill-slate-400 text-[13px]"
            tickLine={false}
            axisLine={false}
            minTickGap={5}
            interval={xAxisInterval}
            tickFormatter={xAxisFormatter}
          >
            {xAxisLabel && (
              <Label position="insideBottom" offset={-20} className="fill-gray-800 text-sm font-medium dark:fill-gray-200">
                {xAxisLabel}
              </Label>
            )}
          </XAxis>

          <YAxis
            width={yAxisWidth}
            hide={!showYAxis}
            axisLine={false}
            tickLine={false}
            type="number"
            domain={yDomain}
            tick={{ transform: 'translate(-3, 0)' }}
            fill=""
            stroke=""
            className="fill-slate-400 text-[13px]"
            tickFormatter={yAxisFormatter ?? valueFormatter}
            allowDecimals={allowDecimals}
          >
            {yAxisLabel && (
              <Label position="insideLeft" style={{ textAnchor: 'middle' }} angle={-90} offset={-15} className="fill-gray-800 text-sm font-medium dark:fill-gray-200">
                {yAxisLabel}
              </Label>
            )}
          </YAxis>

          {showTooltip && (
            <Tooltip
              wrapperStyle={{ outline: 'none' }}
              isAnimationActive
              animationDuration={100}
              cursor={{ fill: '#f1f5f9' }}
              offset={20}
              content={({ active, payload, label }) => {
                const clean: PayloadItem[] = (payload ?? []).map((item: any) => ({
                  category: item.dataKey as string,
                  value: item.value as number,
                  color: categoryColors.get(item.dataKey as string) ?? 'gray',
                }))
                return showTooltip && active ? (
                  <ChartTooltip active={active} payload={clean} label={label as string} valueFormatter={valueFormatter} />
                ) : null
              }}
            />
          )}

          {categories.map((category, i) => {
            const color = categoryColors.get(category)
            const isLast = i === categories.length - 1
            return (
              <Bar
                key={category}
                name={category}
                dataKey={category}
                fill={colorHex(color)}
                stackId={stack ? 'stack' : undefined}
                maxBarSize={maxBarSize}
                radius={
                  // Round top corners: for stacked only on topmost bar, always for grouped
                  isLast || !stack ? [4, 4, 0, 0] : [0, 0, 0, 0]
                }
                isAnimationActive={false}
              />
            )
          })}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}
