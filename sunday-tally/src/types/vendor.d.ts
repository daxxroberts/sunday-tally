// Ambient module declarations for packages without TypeScript types

declare module '@webdatarocks/react-webdatarocks' {
  import { ComponentType } from 'react'

  interface PivotProps {
    toolbar?: boolean
    report?: Record<string, unknown> | string
    height?: number | string
    width?: number | string
    reportcomplete?: () => void
    dataloaded?: () => void
    beforetoolbarcreated?: (toolbar: unknown) => void
    customizeCell?: (cell: unknown, data: unknown) => void
    [key: string]: unknown
  }

  export const Pivot: ComponentType<PivotProps>
  export default Pivot
}

declare module '@webdatarocks/react-webdatarocks/hooks' {
  export { Pivot, default } from '@webdatarocks/react-webdatarocks'
}
