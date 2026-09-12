// Shared long-description markdown grammar (admin editor ⇆ storefront renderer).
// The DB stores a JSON array of ProseBlocks (see lib/types Block). The admin editor
// edits a plain-text/markdown mirror; this module is the single source of truth for
// both directions so the editor text and the storefront rendering can never drift.
//
// Grammar (line-oriented, blank line = block separator):
//   # / ## heading      → h2            ### / #### sub   → h3   (space after # optional:
//   «##مینا کریمی…» without a space is a heading too — Persian keyboards routinely skip it)
//   > quote -- author   → quote (attribution optional)
//   - item              → ul (consecutive)      1. item  → ol (consecutive)
//   ! Title :: text     → callout       ---              → divider
//   ![alt](src)         → image
//   | a | b |  / |---|---|  / | c | d | → table (GFM-style; separator row required)
// Inline (rendered, kept as plain text inside block strings):
//   **bold**   *italic*   `code`
//
// Client-safe (no server imports) — used by the admin editor AND the storefront.

export type MdBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'quote'; text: string; attribution?: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; title?: string; text: string }
  | { type: 'image'; src: string; alt?: string; caption?: string }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'divider' }

/** Inline marks parsed at RENDER time (blocks keep plain text for lossless round-trips). */
export type InlineSpan = { bold?: boolean; italic?: boolean; code?: boolean; text: string }

const CELL_SPLIT = /\s*\|\s*/ // trim cells around the pipe

function splitRow(line: string): string[] {
  let t = line.trim()
  // Drop the leading/trailing structural pipes so "| a | b |" and "a | b" both work.
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|')) t = t.slice(0, -1)
  return t.split('|').map((c) => c.trim())
}

const isSepRow = (cells: string[]) =>
  cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '-')

/** Stored blocks-JSON (or legacy plain text) → editable markdown mirror. */
export function blocksToText(raw: string | null | undefined): string {
  if (!raw) return ''
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw // plain text was stored as-is → keep it plain
  }
  if (!Array.isArray(parsed)) return raw
  // Per-block line groups: lines INSIDE one block (list items, table rows) stay
  // on adjacent rows — the parser consumes consecutive `- `/`N.`/pipe lines as
  // a SINGLE block, so a blank line between them would split each item/row into
  // its own paragraph (BUG-001). Different blocks keep the blank-line separator.
  const groups: string[][] = []
  for (const b of parsed as MdBlock[]) {
    if (!b || typeof b !== 'object') continue
    const lines: string[] = []
    switch (b.type) {
      case 'p':
        lines.push(b.text ?? '')
        break
      case 'h2':
        lines.push(`## ${b.text ?? ''}`)
        break
      case 'h3':
        lines.push(`### ${b.text ?? ''}`)
        break
      case 'quote':
        lines.push(`> ${b.text ?? ''}${b.attribution ? ` -- ${b.attribution}` : ''}`)
        break
      case 'ul':
        for (const item of b.items ?? []) lines.push(`- ${item}`)
        break
      case 'ol':
        ;(b.items ?? []).forEach((item, i) => lines.push(`${i + 1}. ${item}`))
        break
      case 'callout':
        lines.push(`! ${b.title ? `${b.title} :: ` : ''}${b.text ?? ''}`)
        break
      case 'image':
        lines.push(`![${b.alt ?? ''}](${b.src ?? ''})`)
        break
      case 'table': {
        const head = b.head ?? []
        const cols = Math.max(head.length, ...(b.rows ?? []).map((r) => r.length), 1)
        const pad = (cells: string[]) => {
          const c = [...cells]
          while (c.length < cols) c.push('')
          return `| ${c.join(' | ')} |`
        }
        lines.push(pad(head))
        lines.push(pad(head.map(() => '---')))
        for (const r of b.rows ?? []) lines.push(pad(r))
        break
      }
      case 'divider':
        lines.push('---')
        break
      default:
        break
    }
    if (lines.length > 0) groups.push(lines)
  }
  return groups.map((g) => g.join('\n')).filter((s) => s !== '').join('\n\n')
}

/** Editable markdown → ProseBlocks (inverse of blocksToText). */
export function textToBlocks(text: string): MdBlock[] {
  const out: MdBlock[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const t = raw.trim()
    if (t === '') {
      i++
      continue
    }
    if (/^-{3,}$/.test(t)) {
      out.push({ type: 'divider' })
      i++
      continue
    }
    // GFM table: a row of pipes, optionally followed by a separator row of dashes.
    if (t.includes('|') && splitRow(t).length >= 2) {
      const first = splitRow(t)
      const sep = i + 1 < lines.length ? splitRow(lines[i + 1]) : null
      const hasSep = !!sep && isSepRow(sep)
      if (hasSep || first.every((c) => c !== '')) {
        const head = hasSep ? first : first
        let j = hasSep ? i + 2 : i + 1
        // No separator row → treat the FIRST row as the header anyway (forgiving).
        const rows: string[][] = []
        while (j < lines.length && lines[j].trim().includes('|')) {
          const cells = splitRow(lines[j])
          if (cells.some((c) => c !== '')) rows.push(cells)
          j++
        }
        if (hasSep || rows.length > 0) {
          const cols = Math.max(head.length, ...rows.map((r) => r.length), 1)
          const norm = (cells: string[]) => {
            const c = [...cells]
            while (c.length < cols) c.push('')
            return c
          }
          out.push({ type: 'table', head: norm(head), rows: rows.map(norm) })
          i = j
          continue
        }
      }
    }
    if (/^-\s+/.test(t)) {
      const items: string[] = []
      while (i < lines.length && /^-\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^-\s+/, ''))
        i++
      }
      out.push({ type: 'ul', items })
      continue
    }
    if (/^\d+[.)]\s+/.test(t)) {
      const items: string[] = []
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''))
        i++
      }
      out.push({ type: 'ol', items })
      continue
    }
    // Headings — 1+ hashes, space after the hashes OPTIONAL (the admin types
    // «##مینا کریمی …» on Persian keyboards without a space and expects a title).
    // 1–2 hashes → h2, 3+ → h3. «##» alone (no text) stays a plain paragraph,
    // and a text starting with another hash+space («## ## x») is left as text.
    const h = /^(#{1,})[ \t]*(.*)$/.exec(t)
    if (h && h[2] !== '' && !/^#{1,}[ \t]/.test(h[2])) {
      out.push(h[1].length <= 2 ? { type: 'h2', text: h[2] } : { type: 'h3', text: h[2] })
      i++
      continue
    }
    if (t.startsWith('>')) {
      // Quote — one or more '>' with optional space (CommonMark-style tolerant):
      // "> نقل قول" and ">نقل قول" both work.
      const rest = t.replace(/^>+[ ]?/, '')
      const sep = rest.lastIndexOf(' -- ')
      out.push(
        sep >= 0
          ? { type: 'quote', text: rest.slice(0, sep), attribution: rest.slice(sep + 4) }
          : { type: 'quote', text: rest },
      )
      i++
      continue
    }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/.exec(t)
    if (img) {
      out.push({ type: 'image', alt: img[1], src: img[2], caption: img[3] || undefined })
      i++
      continue
    }
    if (t.startsWith('! ')) {
      const rest = t.slice(2)
      const sep = rest.indexOf(' :: ')
      out.push(
        sep >= 0
          ? { type: 'callout', title: rest.slice(0, sep), text: rest.slice(sep + 4) }
          : { type: 'callout', text: rest },
      )
      i++
      continue
    }
    out.push({ type: 'p', text: raw.trim() })
    i++
  }
  return out
}

/**
 * Tokenize inline marks into styled spans: **bold**, *italic*, `code`.
 * Single pass, no regex overlap: `code` wins first, then bold, then italic.
 */
export function parseInlineSpans(text: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  let bold = false
  let italic = false
  let code = false
  let buf = ''
  const flush = () => {
    if (buf) spans.push({ bold, italic, code, text: buf })
    buf = ''
  }
  let i = 0
  while (i < text.length) {
    const rest = text.slice(i)
    if (rest.startsWith('`')) {
      flush()
      code = !code
      i += 1
      continue
    }
    if (rest.startsWith('**')) {
      flush()
      bold = !bold
      i += 2
      continue
    }
    if (rest.startsWith('*')) {
      flush()
      italic = !italic
      i += 1
      continue
    }
    // NOTE: underscore italics deliberately NOT supported — snake_case and
    // Persian-adjacent underscores would mis-toggle mid-word. *italic* only.
    buf += text[i]
    i += 1
  }
  flush()
  return spans
}

/** Inline marks removed — for SEO strings, alt text, previews, search. */
export function stripInline(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1')
}
