'use client'

// InlineEditField — pencil icon + editable input + save on blur.
// Used in: T6, T_LOC, T_TAGS, T7, T8, T_GIVING_SOURCES (HANDOFF_BRIEF shared components)

import { useState, useRef } from 'react'

interface InlineEditFieldProps {
  value: string
  onSave: (newValue: string) => Promise<void> | void
  placeholder?: string
  className?: string
  inputClassName?: string
  disabled?: boolean
  'aria-label'?: string
}

export default function InlineEditField({
  value,
  onSave,
  placeholder = 'Enter value',
  className = '',
  inputClassName = '',
  disabled = false,
  'aria-label': ariaLabel,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    if (disabled) return
    setDraft(value)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function handleBlur() {
    if (draft.trim() === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(draft.trim())
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      inputRef.current?.blur()
    }
    if (e.key === 'Escape') {
      setDraft(value)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={saving}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`w-full border-b border-gray-900 outline-none py-0.5 text-gray-900 bg-transparent ${inputClassName}`}
      />
    )
  }

  return (
    <div className={`flex items-center gap-2 group ${className}`}>
      <span className={`text-gray-900 ${!value ? 'text-gray-400' : ''}`}>
        {value || placeholder}
      </span>
      {!disabled && (
        <button
          onClick={startEdit}
          aria-label={`Edit ${ariaLabel || 'field'}`}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-gray-400 hover:text-gray-700 p-0.5"
        >
          {/* Pencil icon */}
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}
    </div>
  )
}
