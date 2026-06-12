'use client'

/**
 * Lightweight markdown-ish renderer for chat bubbles. Handles only the bits the
 * AI actually uses: bold (**...**), italic (*...*), inline code (`...`), and
 * leading-# headings. Returns React nodes; safe (no dangerouslySetInnerHTML).
 *
 * No external dependency — chat messages render fast and trees stay simple.
 */
export function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  return lines.map((line, lineIdx) => {
    let content: React.ReactNode = line
    let elementWrapper: 'h1' | 'h2' | 'h3' | 'p' = 'p'

    // Heading prefixes — leading #'s on a line
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      elementWrapper = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
      content = headingMatch[2]
    }

    // Inline pass: bold, italic, code
    const stringContent = typeof content === 'string' ? content : ''
    if (stringContent) {
      const parts: React.ReactNode[] = []
      const inlineRegex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g
      let lastIndex = 0
      let match: RegExpExecArray | null
      let partIdx = 0
      while ((match = inlineRegex.exec(stringContent)) !== null) {
        if (match.index > lastIndex) {
          parts.push(stringContent.slice(lastIndex, match.index))
        }
        const tok = match[0]
        if (tok.startsWith('**')) {
          // Gold-tinted bold — makes emphasis pop against the dark blue chat panel
          // while keeping the body text comfortable to read. Subtle, not loud.
          parts.push(
            <strong key={`b${lineIdx}-${partIdx++}`} className="font-bold text-amber-200">
              {tok.slice(2, -2)}
            </strong>,
          )
        } else if (tok.startsWith('`')) {
          parts.push(
            <code key={`c${lineIdx}-${partIdx++}`} className="bg-gray-950/60 border border-gray-700/40 rounded px-1 py-0.5 text-[10.5px] font-mono">
              {tok.slice(1, -1)}
            </code>,
          )
        } else if (tok.startsWith('*')) {
          parts.push(<em key={`i${lineIdx}-${partIdx++}`}>{tok.slice(1, -1)}</em>)
        }
        lastIndex = match.index + tok.length
      }
      if (lastIndex < stringContent.length) parts.push(stringContent.slice(lastIndex))
      content = parts.length > 0 ? <>{parts}</> : stringContent
    }

    if (elementWrapper === 'h1')
      return <div key={lineIdx} className="text-sm font-bold text-white mt-1 mb-0.5">{content}</div>
    if (elementWrapper === 'h2')
      return <div key={lineIdx} className="text-[12.5px] font-bold text-gray-100 mt-1 mb-0.5">{content}</div>
    if (elementWrapper === 'h3')
      return <div key={lineIdx} className="text-[11.5px] font-semibold text-gray-200 mt-0.5">{content}</div>
    // Preserve blank lines as a small vertical gap
    if (line.trim() === '') return <div key={lineIdx} className="h-1.5" />
    return <div key={lineIdx}>{content}</div>
  })
}

/**
 * Detects "Option N: ..." lines in an assistant chat message and splits the
 * message into prose + clickable choices. The AI is instructed (in the chat
 * route system prompt) to use this exact format when offering choices, so the
 * UI can render them as buttons instead of forcing the user to retype.
 *
 * Matches lines like:
 *   "Option 1: Combine them into one giving line"
 *   "Option 2: Keep both columns as separate giving sources"
 *   "Option 3: Other — describe what you want instead"
 *
 * Returns the prose with those option lines removed, plus the parsed options.
 * If no option lines are present, returns { prose: original, options: [] }.
 */
export function parseAssistantOptions(text: string): { prose: string; options: { label: string; isOther: boolean }[] } {
  const lines = text.split('\n')
  const optionRegex = /^\s*Option\s+(\d+)\s*[:.\-]\s*(.+?)\s*$/i
  const options: { label: string; isOther: boolean }[] = []
  const kept: string[] = []
  for (const line of lines) {
    const m = line.match(optionRegex)
    if (m) {
      const label = m[2].trim()
      const isOther = /^other\b/i.test(label)
      options.push({ label, isOther })
    } else {
      kept.push(line)
    }
  }
  // Only treat as options if at least 2 were parsed; one stray "Option 1:" isn't a choice block
  if (options.length < 2) {
    return { prose: text, options: [] }
  }
  // Trim trailing blank lines we left behind
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop()
  return { prose: kept.join('\n'), options }
}
