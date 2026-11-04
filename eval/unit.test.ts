/** Unit tests for the pure pipeline logic. Run: npm test (node --test, no extra deps). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSegmentation, mergeTracks, samCost } from '../worker/src/sam.ts'
import { clockMinutes, byClock } from '../worker/src/clock.ts'
import { computeUsd, emptyCost } from '../worker/src/cost.ts'

const box = (x: number) => `<|box;x1=${x};y1=10;x2=${x + 50};y2=60;w=1280;h=720;c=0.9|>`

test('SAM grammar: frames and multiple objects per frame', () => {
  const text = `<0f>0${box(100)}<1f>0${box(110)}1${box(400)}<2f>1${box(410)}`
  const recs = parseSegmentation(text)
  assert.equal(recs.length, 4)
  assert.deepEqual(recs.map((r) => [r.frame, r.object_id]), [[0, 0], [1, 0], [1, 1], [2, 1]])
  assert.equal(recs[0].box.x2, 150)
  assert.equal(recs[0].confidence, 0.9)
})

test('SAM grammar: confidence is optional and negative coords parse', () => {
  const recs = parseSegmentation('<5f>3<|box;x1=-4;y1=0;x2=20;y2=30;w=640;h=480|>')
  assert.equal(recs.length, 1)
  assert.equal(recs[0].box.x1, -4)
  assert.equal(recs[0].confidence, null)
})

test('SAM grammar: preamble before the first frame marker is ignored', () => {
  const recs = parseSegmentation(`dog 0${box(999)}\n<0f>0${box(100)}<3f>0${box(130)}`)
  assert.deepEqual(recs.map((r) => r.box.x1), [100, 130])
})

test('mergeTracks: persistent identity spans an occlusion gap with timestamps from fps', () => {
  // object 0 seen at frames 0-30, absent 31-89 (occlusion), back at 90-120, at 30 fps
  let text = ''
  for (const f of [0, 30, 90, 120]) text += `<${f}f>0${box(f)}`
  const [track] = mergeTracks(parseSegmentation(text), 30)
  assert.equal(track.object_id, 0)
  assert.equal(track.n_frames, 4)
  assert.equal(track.first_seen, 0)
  assert.equal(track.last_seen, 4)
  assert.equal(track.detections[2].t, 3)
})

test('mergeTracks: tracks sorted by first appearance', () => {
  const text = `<0f>7${box(1)}<10f>2${box(2)}<20f>7${box(3)}`
  const tracks = mergeTracks(parseSegmentation(text), 10)
  assert.deepEqual(tracks.map((t) => t.object_id), [7, 2])
})

test('samCost: 50-frame minimum per request', () => {
  assert.equal(samCost(10), samCost(50))
  assert.equal(samCost(7200), 1.44)
})

test('clockMinutes: 12h and 24h forms', () => {
  assert.equal(clockMinutes('7:42 PM'), 19 * 60 + 42)
  assert.equal(clockMinutes('7:42pm'), 19 * 60 + 42)
  assert.equal(clockMinutes('7:42 p.m.'), 19 * 60 + 42)
  assert.equal(clockMinutes('12:05 AM'), 5)
  assert.equal(clockMinutes('12:30 PM'), 12 * 60 + 30)
  assert.equal(clockMinutes('7 PM'), 19 * 60)
  assert.equal(clockMinutes('19:42'), 19 * 60 + 42)
  assert.equal(clockMinutes('07:05'), 7 * 60 + 5)
})

test('clockMinutes: rejects garbage and ambiguity', () => {
  for (const bad of ['', 'evening', '25:00', '7:61 PM', '13:00 PM', '7']) assert.equal(clockMinutes(bad), null, bad)
})

test('byClock: chronological, not lexicographic; unknown times last', () => {
  const clocks = ['10:05 PM', '', '7:42 PM', '19:50', 'dusk', '6:15 PM']
  assert.deepEqual([...clocks].sort(byClock), ['6:15 PM', '7:42 PM', '19:50', '10:05 PM', '', 'dusk'])
})

test('cost meter: a 1-hour neighborhood search stays under ~$3 (README economics)', () => {
  const c = { ...emptyCost(), sam_frames: 7200, spark_in: 50 * 3000, spark_out: 50 * 150, asr_seconds: 30, images: 1 }
  const usd = computeUsd(c)
  assert.ok(usd > 1.5 && usd < 3.5, `usd=${usd}`)
})
