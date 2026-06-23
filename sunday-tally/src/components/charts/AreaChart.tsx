'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
// AreaChart — adapted from Tremor (Apache-2.0) for recharts v3 + Tailwind v4

import React from 'react'
import {
  Area,
  CartesianGrid,
  Dot,
  Label,
  Line,
  AreaChart as RechartsAreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  constructCategoryColors,
  colorClass,
  defaultColors,
  type ChartColorKey,
} from './chartUtils'

// ── Tooltip ──────────────────────────────────────────────────────────────────

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
                className={`h-[3px] w-3.5 shrink-0 rounded-full ${colorClass(color, 'bg')}`}
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

// ── AreaChart ─────────────────────────────────────────────────────────────────

export interface AreaChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: Record<string, unknown>[]
  index: string
  categories: string[]
  colors?: ChartColorKey[]
  valueFormatter?: (value: number) => string
  /** Optional formatter for Y-axis tick labels (defaults to valueFormatter — use a
   *  compact "1.2k" formatter so long numbers don't overflow a narrow axis). */
  yAxisFormatter?: (value: number) => string
  /** Format the tooltip's header (the x value) — e.g. "2026-02" → "Feb '26". */
  labelFormatter?: (label: string) => string
  /** Display names for series keys in the tooltip/legend, e.g. { value: 'This year' }. */
  categoryLabels?: Record<string, string>
  /** X-axis tick density: a number (show every Nth label) or a recharts preset.
   *  Defaults to 'equidistantPreserveStart'. Pass 0 to show every label. */
  xAxisInterval?: number | 'preserveStart' | 'preserveEnd' | 'preserveStartEnd' | 'equidistantPreserveStart'
  /** Show only first + last tick on x-axis */
  startEndOnly?: boolean
  showXAxis?: boolean
  showYAxis?: boolean
  yAxisWidth?: number
  showGridLines?: boolean
  showTooltip?: boolean
  showLegend?: boolean
  /** 'gradient' | 'solid' | 'none' — use 'none' for the flat-line look */
  fill?: 'gradient' | 'solid' | 'none'
  /** Stacking mode */
  type?: 'default' | 'stacked' | 'percent'
  autoMinValue?: boolean
  minValue?: number
  maxValue?: number
  allowDecimals?: boolean
  connectNulls?: boolean
  xAxisLabel?: string
  yAxisLabel?: string
  /** Optional formatter for x-axis tick labels (e.g. date bucket formatting) */
  xAxisFormatter?: (value: string) => string
}

export function AreaChart({
  data = [],
  categories = [],
  index,
  colors = defaultColors,
  valueFormatter = (v) => String(v),
  yAxisFormatter,
  labelFormatter,
  categoryLabels,
  xAxisInterval,
  startEndOnly = false,
  showXAxis = true,
  showYAxis = true,
  yAxisWidth = 56,
  showGridLines = true,
  showTooltip = true,
  showLegend = true,
  fill = 'gradient',
  type = 'default',
  autoMinValue = false,
  minValue,
  maxValue,
  allowDecimals = true,
  connectNulls = false,
  xAxisLabel,
  yAxisLabel,
  xAxisFormatter,
  className,
  ...rest
}: AreaChartProps) {
  const categoryColors = constructCategoryColors(categories, colors)
  const areaId = React.useId()
  const stacked = type === 'stacked' || type === 'percent'

  const paddingValue = !showXAxis && !showYAxis ? 0 : startEndOnly && !showYAxis ? 0 : 20

  const yDomain: [number | string, number | string] = autoMinValue
    ? ['auto', maxValue ?? 'auto']
    : [minValue ?? 0, maxValue ?? 'auto']

  function valueToPercent(v: number) {
    return `${(v * 100).toFixed(0)}%`
  }

  function getFillStop(fillType: typeof fill, category: string) {
    const opacity = 0.3
    switch (fillType) {
      case 'none':
        return <stop stopColor="currentColor" stopOpacity={0} />
      case 'solid':
        return <stop stopColor="currentColor" stopOpacity={opacity} />
      case 'gradient':
      default:
        return (
          <>
            <stop offset="5%" stopColor="currentColor" stopOpacity={opacity} />
            <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
          </>
        )
    }
  }

  // Simple inline legend (no scroll buttons — add enableLegendSlider variant later if needed)
  function Legend() {
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 pb-2">
        {categories.map((cat) => {
          const color = categoryColors.get(cat)
          return (
            <div key={cat} className="flex items-center gap-1.5">
              <span className={`h-[3px] w-3.5 shrink-0 rounded-full ${colorClass(color, 'bg')}`} aria-hidden />
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
        <RechartsAreaChart
          data={data}
          margin={{
            bottom: xAxisLabel ? 30 : undefined,
            left: yAxisLabel ? 20 : undefined,
            right: yAxisLabel ? 5 : undefined,
            top: 5,
          }}
          stackOffset={type === 'percent' ? 'expand' : undefined}
        >
          {showGridLines && (
            <CartesianGrid
              className="stroke-slate-100"
              horizontal
              vertical={false}
            />
          )}

          <XAxis
            padding={{ left: paddingValue, right: paddingValue }}
            hide={!showXAxis}
            dataKey={index}
            interval={xAxisInterval ?? (startEndOnly ? 'preserveStartEnd' : 'equidistantPreserveStart')}
            tick={{ transform: 'translate(0, 6)' }}
            ticks={
              startEndOnly && data.length
                ? [data[0][index] as string, data[data.length - 1][index] as string]
                : undefined
            }
            fill=""
            stroke=""
            className="fill-slate-400 text-[13px]"
            tickLine={false}
            axisLine={false}
            minTickGap={5}
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
            tickFormatter={type === 'percent' ? valueToPercent : (yAxisFormatter ?? valueFormatter)}
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
              cursor={{ stroke: '#d1d5db', strokeWidth: 1 }}
              offset={20}
              position={{ y: 0 }}
              content={({ active, payload, label }) => {
                const clean: PayloadItem[] = (payload ?? []).map((item: any) => ({
                  category: categoryLabels?.[item.dataKey as string] ?? (item.dataKey as string),
                  value: item.value as number,
                  color: categoryColors.get(item.dataKey as string) ?? 'gray',
                }))
                const shownLabel = labelFormatter ? labelFormatter(label as string) : (label as string)
                return showTooltip && active ? (
                  <ChartTooltip active={active} payload={clean} label={shownLabel} valueFormatter={valueFormatter} />
                ) : null
              }}
            />
          )}

          {categories.map((category) => {
            const catId = `${areaId}-${category.replace(/[^a-zA-Z0-9]/g, '')}`
            const color = categoryColors.get(category)
            return (
              <React.Fragment key={category}>
                <defs>
                  <linearGradient
                    id={catId}
                    className={colorClass(color, 'text')}
                    x1="0" y1="0" x2="0" y2="1"
                  >
                    {getFillStop(fill, category)}
                  </linearGradient>
                </defs>
                <Area
                  className={colorClass(color, 'stroke')}
                  key={category}
                  name={category}
                  type="monotone"
                  dataKey={category}
                  stroke=""
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  isAnimationActive={false}
                  connectNulls={connectNulls}
                  stackId={stacked ? 'stack' : undefined}
                  fill={`url(#${catId})`}
                  activeDot={(props: any) => (
                    <Dot
                      className={`stroke-white dark:stroke-gray-950 ${colorClass(color, 'fill')}`}
                      cx={props.cx}
                      cy={props.cy}
                      r={5}
                      fill=""
                      stroke={props.stroke}
                      strokeLinecap={props.strokeLinecap}
                      strokeLinejoin={props.strokeLinejoin}
                      strokeWidth={props.strokeWidth}
                    />
                  )}
                  dot={false}
                />
              </React.Fragment>
            )
          })}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  )
}
