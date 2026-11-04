/** Clock strings come from two places: <input type="time"> ("19:42") and the owner's
 * free-text prompt ("7:42 PM"). Parse both to minutes after midnight so sightings sort
 * chronologically; a plain string compare puts "10:05 PM" before "7:42 PM". */
export function clockMinutes(clock: string): number | null {
  const m = String(clock ?? '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?$/i)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  const ampm = m[3]?.toLowerCase()
  if (min > 59) return null
  if (ampm) {
    if (h < 1 || h > 12) return null
    if (ampm === 'p' && h < 12) h += 12
    if (ampm === 'a' && h === 12) h = 0
  } else if (h > 23 || m[2] === undefined) {
    return null // bare "7" is ambiguous; only accept 24h "HH:MM" without am/pm
  }
  return h * 60 + min
}

/** Chronological comparator; unparseable clocks sort last, in their original order. */
export function byClock(a: string, b: string): number {
  const ma = clockMinutes(a)
  const mb = clockMinutes(b)
  if (ma === null && mb === null) return 0
  if (ma === null) return 1
  if (mb === null) return -1
  return ma - mb
}
