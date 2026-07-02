'use client'

// ─────────────────────────────────────────────────────────────────────────
// Tooltip — on-brand replacement for the native `title=` browser tooltip
// (grey OS box, no styling control). Portaled to <body> with fixed
// positioning so it's never clipped by an `overflow-hidden` card, matching
// the dark pill style already used in dashboard/ui.tsx's ColumnHeaders.
// ─────────────────────────────────────────────────────────────────────────

import { isValidElement, cloneElement, useId, useState } from 'react'
import { createPortal } from 'react-dom'

export function Tooltip({ text, children, className }: {
  text: string
  children: React.ReactNode
  /** Applied to the wrapping trigger span — pass layout classes here (e.g. shrink-0). */
  className?: string
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  // #67 — stable id linking the trigger to its tooltip content via aria-describedby,
  // so a screen reader announces the tooltip text when the trigger receives focus.
  const tooltipId = useId()

  const open = (e: React.MouseEvent | React.FocusEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top })
  }
  const close = () => setPos(null)
  // WCAG 1.4.13 (Content on Hover or Focus) — Escape must dismiss without moving
  // focus off the trigger.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && pos) {
      e.stopPropagation()
      close()
    }
  }

  // aria-describedby has to live on the actual interactive trigger element (the
  // thing that receives focus) for AT to announce it — not on this wrapping span,
  // which is never focused. When children is a single element we clone it with
  // the id attached; otherwise fall back to describing the wrapper itself.
  const describedChildren = isValidElement(children)
    ? cloneElement(children as React.ReactElement<{ 'aria-describedby'?: string }>, {
        'aria-describedby': tooltipId,
      })
    : children

  return (
    <span
      className={className}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      onKeyDown={onKeyDown}
      {...(isValidElement(children) ? {} : { 'aria-describedby': tooltipId })}
    >
      {describedChildren}
      {pos && typeof document !== 'undefined' && createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          style={{ position: 'fixed', left: pos.x, top: pos.y - 8, transform: 'translate(-50%, -100%)' }}
          className="pointer-events-none z-[100] w-max max-w-[260px] rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium leading-snug text-white shadow-xl"
        >
          {text}
        </div>,
        document.body,
      )}
    </span>
  )
}
