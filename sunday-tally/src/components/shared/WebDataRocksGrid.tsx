'use client'

import '@webdatarocks/webdatarocks/webdatarocks.css'
import dynamic from 'next/dynamic'

// WebDataRocks is browser-only — SSR disabled
const Pivot = dynamic(
  () => import('@webdatarocks/react-webdatarocks/hooks').then(m => ({ default: m.Pivot })),
  {
    ssr: false,
    loading: () => (
      <div
        className="animate-pulse bg-gray-100 rounded"
        style={{ height: '100%', minHeight: 60 }}
      />
    ),
  }
)

export interface GridColumn {
  id: string    // key in the data object
  title: string // header label shown in the grid
}

interface WebDataRocksGridProps {
  data: Record<string, unknown>[]
  columns?: GridColumn[]  // if omitted, all fields are shown with their original names
  height?: number
}

export default function WebDataRocksGrid({
  data,
  columns,
  height = 300,
}: WebDataRocksGridProps) {
  // Remap keys to display titles so WebDataRocks shows them as column headers.
  // WebDataRocks flat mode uses field names directly as captions.
  const gridData = columns
    ? data.map(row => {
        const out: Record<string, unknown> = {}
        for (const col of columns) out[col.title] = row[col.id]
        return out
      })
    : data

  const report = {
    dataSource: { data: gridData },
    options: {
      grid: {
        type: 'flat',
        showTotals: 'off',
        showGrandTotals: 'off',
        showFilter: false,
      },
    },
  }

  return (
    <div style={{ height }}>
      <Pivot toolbar={false} report={report} height={height} />
    </div>
  )
}
