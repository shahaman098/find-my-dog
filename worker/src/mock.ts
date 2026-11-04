/** Deterministic mock pipeline (FMD_MOCK=1 or no key configured).
 *
 * Purpose: (1) full E2E before any API key exists, (2) judging-night fallback
 * if the live API flakes — the deployed product always prefers real inference.
 * Mock data mirrors real response shapes, including a 3s occlusion gap in the
 * tracked animal, so the persistence story demos identically.
 */
import type { Track } from './types'
import { mergeTracks, type SamRecord } from './sam.ts'

const FPS = 30
const DURATION = 30

export function mockSamRecords(concept: string): SamRecord[] {
  if (concept !== 'dog' && concept !== 'cat') concept = 'dog'
  const records: SamRecord[] = []
  // Track 0 "the pet": 0-12s, absent 12-15s (occlusion), back 15-30s.
  for (let f = 0; f <= 12 * FPS; f += 2) {
    records.push(mk(f, 0, 300 + f * 0.4, 200 + f * 0.15, 0.93))
  }
  for (let f = 15 * FPS; f <= 30 * FPS; f += 2) {
    records.push(mk(f, 0, 320 + f * 0.35, 210 + f * 0.1, 0.9))
  }
  // Track 1 "a neighbor's cat": brief appearance mid-clip.
  for (let f = 17 * FPS; f <= 21 * FPS; f += 3) {
    records.push(mk(f, 1, 640 - f * 0.5, 380, 0.81))
  }
  return records

  function mk(frame: number, id: number, x: number, y: number, c: number): SamRecord {
    return { frame, object_id: id, box: { x1: Math.round(x), y1: Math.round(y), x2: Math.round(x + 260), y2: Math.round(y + 200), w: 1280, h: 720 }, confidence: c }
  }
}

export function mockTracks(): Track[] {
  return mergeTracks(mockSamRecords('dog'), FPS)
}

export function mockTranscript(): string {
  return 'Biscuit has been missing since this evening. She is small, tan, with a white chest and a red collar. She loves the park behind the houses.'
}

export function mockMatch(trackKey: string): { is_match: boolean; confidence: number; rationale: string } {
  const isTarget = trackKey.endsWith(':0')
  return {
    is_match: isTarget,
    confidence: isTarget ? 0.87 : 0.21,
    rationale: isTarget
      ? 'Tan coat with a white chest patch and similar build to the reference photo; consistent with the description.'
      : 'Coat pattern and size differ from the reference photo; likely a different animal.',
  }
}

export function mockPlan() {
  return {
    headline: `Search the park at dawn`,
    window: 'Tomorrow 5:30–7:30 AM',
    area: 'The park behind the houses and the alley toward Elm St',
    why: 'Both sightings cluster in the evening near the park fence; lost dogs often return to familiar spots at dawn when streets are quiet.',
    steps: [
      'Walk the park fence line at first light with the reference photo',
      'Check the alley toward Elm St where track #1 was last seen',
      'Post the alert poster on the street’s community group',
    ],
  }
}

export const MOCK_POSTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="960"><rect width="680" height="960" fill="#123"/><text x="340" y="120" font-size="64" fill="#fff" text-anchor="middle" font-family="sans-serif" font-weight="bold">MISSING DOG</text><text x="340" y="220" font-size="40" fill="#fda" text-anchor="middle" font-family="sans-serif">Biscuit</text><text x="340" y="540" font-size="26" fill="#cde" text-anchor="middle" font-family="sans-serif">Tan · white chest · red collar</text><text x="340" y="880" font-size="28" fill="#fff" text-anchor="middle" font-family="sans-serif">Seen on camera — help us bring her home</text></svg>`
