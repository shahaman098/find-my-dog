/** D1-backed report state: one JSON blob per report (demo scale, zero ORM). */
import type { ReportState } from './types'

let schemaReady = false

async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReady) return
  await db
    .prepare('CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)')
    .run()
  schemaReady = true
}

export async function createState(db: D1Database, state: ReportState): Promise<void> {
  await ensureSchema(db)
  await db
    .prepare('INSERT INTO reports (id, state, updated_at) VALUES (?, ?, ?)')
    .bind(state.report_id, JSON.stringify(state), Date.now())
    .run()
}

export async function readState(db: D1Database, reportId: string): Promise<ReportState | null> {
  await ensureSchema(db)
  const row = await db.prepare('SELECT state FROM reports WHERE id = ?').bind(reportId).first<{ state: string }>()
  return row ? (JSON.parse(row.state) as ReportState) : null
}

export async function updateState(
  db: D1Database,
  reportId: string,
  fn: (s: ReportState) => void,
): Promise<ReportState> {
  // Read-modify-write; single-process demo scale makes a transaction unnecessary,
  // but retry once on the rare concurrent-write error to survive double-clicks.
  for (let attempt = 0; attempt < 2; attempt++) {
    const state = await readState(db, reportId)
    if (!state) throw new Error(`report ${reportId} not found`)
    fn(state)
    try {
      await db
        .prepare('UPDATE reports SET state = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(state), Date.now(), reportId)
        .run()
      return state
    } catch (e) {
      if (attempt === 1) throw e
    }
  }
  throw new Error('unreachable')
}
