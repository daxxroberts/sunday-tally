'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import DataReviewPanel, { type ReviewChoice } from '@/components/shared/DataReviewPanel'
import type { GridColumn } from '@/components/shared/WebDataRocksGrid'

export interface DataReviewConfig {
  title?: string
  data: Record<string, unknown>[]
  columns?: GridColumn[]
  question: string
  choices: ReviewChoice[]
  onChoice: (value: string) => void
}

interface DataReviewContextValue {
  open: (config: DataReviewConfig) => void
  close: () => void
}

const DataReviewContext = createContext<DataReviewContextValue | null>(null)

export function DataReviewProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<DataReviewConfig | null>(null)

  const open = useCallback((cfg: DataReviewConfig) => setConfig(cfg), [])
  const close = useCallback(() => setConfig(null), [])

  return (
    <DataReviewContext.Provider value={{ open, close }}>
      {children}
      {config && (
        <DataReviewPanel
          isOpen
          onClose={close}
          title={config.title}
          data={config.data}
          columns={config.columns}
          question={config.question}
          choices={config.choices}
          onChoice={config.onChoice}
        />
      )}
    </DataReviewContext.Provider>
  )
}

export function useDataReview() {
  const ctx = useContext(DataReviewContext)
  if (!ctx) throw new Error('useDataReview must be used within DataReviewProvider')
  return ctx
}
