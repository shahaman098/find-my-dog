/** Parser for the SAM 3.1 segmentation output grammar.
 *
 * Streamed per-frame text:
 *   <Nf>objectId<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..[;c=..]|>
 * Frame N at fps f -> t = N / f seconds into the clip.
 */
import type { Box, Detection, Track } from './types'

const FRAME_RE = /<(\d+)f>/g
const RECORD_RE = /(\d+)<\|box;x1=(-?\d+);y1=(-?\d+);x2=(-?\d+);y2=(-?\d+);w=(\d+);h=(\d+)(?:;c=([\d.]+))?\|>/g

export interface SamRecord { frame: number; object_id: number; box: Box; confidence: number | null }

export function parseSegmentation(text: string): SamRecord[] {
  const out: SamRecord[] = []
  // Normalize: frames arrive as separate deltas; split on frame markers.
  const parts: string[] = []
  let last = 0
  for (const m of text.matchAll(FRAME_RE)) {
    parts.push(text.slice(last, m.index ?? 0), m[1])
    last = (m.index ?? 0) + m[0].length
  }
  parts.push(text.slice(last))
  // parts: [pre, frame, payload, frame, payload, ...]
  for (let i = 1; i < parts.length - 1; i += 2) {
    const frame = parseInt(parts[i], 10)
    const payload = parts[i + 1]
    for (const m of payload.matchAll(RECORD_RE)) {
      out.push({
        frame,
        object_id: parseInt(m[1], 10),
        box: { x1: +m[2], y1: +m[3], x2: +m[4], y2: +m[5], w: +m[6], h: +m[7] },
        confidence: m[8] ? parseFloat(m[8]) : null,
      })
    }
  }
  return out
}

export function mergeTracks(records: SamRecord[], fps: number, offsetS = 0): Track[] {
  const byId = new Map<number, Detection[]>()
  for (const r of records) {
    const dets = byId.get(r.object_id) ?? []
    dets.push({ frame: r.frame, t: Math.round((offsetS + r.frame / fps) * 100) / 100, box: r.box, confidence: r.confidence })
    byId.set(r.object_id, dets)
  }
  const tracks: Track[] = []
  for (const [object_id, dets] of byId) {
    tracks.push({
      object_id,
      n_frames: dets.length,
      first_seen: dets[0].t,
      last_seen: dets[dets.length - 1].t,
      confidence: Math.max(...dets.map((d) => d.confidence ?? 0)) || null,
      detections: dets,
    })
  }
  tracks.sort((a, b) => a.first_seen - b.first_seen)
  return tracks
}

/** SAM video pricing: $0.20 per 1k frames, billed with a 50-frame minimum per request. */
export function samCost(framesBilled: number): number {
  return Math.round((Math.max(framesBilled, 50) / 1000) * 0.2 * 10000) / 10000
}
