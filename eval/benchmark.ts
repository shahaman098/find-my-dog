/** Real-model benchmark: runs the *production* parser, prompts and model clients
 * (worker/src/{sam,prompts,meta}.ts) against real footage. No mocks.
 *
 *   export META_API_KEY=...            (or: export $(grep -v '^#' .dev.vars | xargs))
 *   node eval/benchmark.ts track  --clip eval/fixtures/dogpark_10fps.mp4 --fps 10 --out eval/results/dogpark.tracks.json
 *   node eval/benchmark.ts crops  --clip eval/fixtures/dogpark_10fps.mp4 --tracks eval/results/dogpark.tracks.json --dir eval/fixtures/crops/dogpark
 *   node eval/benchmark.ts match  --cases eval/results/match_cases.json --trials 1 --out eval/results/match.json
 *   node eval/benchmark.ts plan   --owner <crop.jpg> --sighting <crop.jpg> --out eval/results/plan.json
 *
 * Footage and crops stay local (eval/fixtures is git-ignored); only numbers are committed.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseSegmentation, mergeTracks } from '../worker/src/sam.ts'
import { MATCH_SCHEMA, matchPrompt, TOOLS, coordinatorInput, posterPrompt } from '../worker/src/prompts.ts'
import { sparkStructured, toolLoop, generatePoster, BASE } from '../worker/src/meta.ts'
import { computeUsd, emptyCost } from '../worker/src/cost.ts'
import type { Env, Track } from '../worker/src/types.ts'

const KEY = process.env.META_API_KEY
if (!KEY) {
  console.error('META_API_KEY missing (export $(grep -v "^#" .dev.vars | xargs))')
  process.exit(2)
}
const env = { META_API_KEY: KEY, SPARK_MODEL: process.env.SPARK_MODEL ?? 'muse-spark-1.3' } as unknown as Env

const args = process.argv.slice(2)
const cmd = args[0]
const opt = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : d
}
const writeJson = (p: string, v: unknown) => {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n')
  console.log(`wrote ${p}`)
}
const b64 = (p: string) => 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64')

// ---------- SAM 3.1 tracking (file upload: the local clip has no public URL) ----------
async function samTrack(clip: string, fps: number, concept: string) {
  const form = new FormData()
  form.append('purpose', 'user_data')
  form.append('file', new Blob([fs.readFileSync(clip)], { type: 'video/mp4' }), path.basename(clip))
  const up = await fetch(`${BASE}/files`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form })
  if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 300)}`)
  const fileId = (await up.json()).id
  const t0 = Date.now()
  const r = await fetch(`${BASE}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sam-3.1',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: concept }, { type: 'input_video', file_id: fileId }] }],
      stream: true,
    }),
  })
  if (!r.ok || !r.body) throw new Error(`sam ${r.status}: ${(await r.text()).slice(0, 300)}`)
  let text = ''
  let buf = ''
  const dec = new TextDecoder()
  for (const reader = r.body.getReader(); ;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const events = buf.split('\n\n')
    buf = events.pop() ?? ''
    for (const evt of events) for (const line of evt.split('\n')) {
      if (!line.startsWith('data:')) continue
      const d = line.slice(5).trim()
      if (d === '[DONE]') continue
      try { const j = JSON.parse(d); if (j.type === 'response.output_text.delta' && j.delta) text += j.delta } catch { /* partial */ }
    }
  }
  const records = parseSegmentation(text)
  return { tracks: mergeTracks(records, fps), records: records.length, seconds: (Date.now() - t0) / 1000, raw: text }
}

/** Gaps inside a track longer than `minGap` seconds = the identity survived an absence. */
function gapsOf(t: Track, minGap = 0.5): number[] {
  const out: number[] = []
  for (let i = 1; i < t.detections.length; i++) {
    const g = t.detections[i].t - t.detections[i - 1].t
    if (g > minGap) out.push(Math.round(g * 10) / 10)
  }
  return out
}

// ---------- stills: same 8% padded crop the browser makes (web/src/probe.js) ----------
function crop(clip: string, t: number, box: Track['detections'][0]['box'], out: string) {
  const pad = 0.08
  const w = box.x2 - box.x1, h = box.y2 - box.y1
  const x = Math.max(0, Math.round(box.x1 - pad * w)), y = Math.max(0, Math.round(box.y1 - pad * h))
  const cw = Math.min(box.w - x, Math.round(w * (1 + 2 * pad))), ch = Math.min(box.h - y, Math.round(h * (1 + 2 * pad)))
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(Math.max(t, 0)), '-i', clip, '-frames:v', '1', '-vf', `crop=${cw}:${ch}:${x}:${y}`, '-q:v', '3', out])
}

async function main() {
  if (cmd === 'track') {
    const clip = opt('clip')!, fps = Number(opt('fps', '10')), out = opt('out')!
    const r = await samTrack(clip, fps, opt('concept', 'dog')!)
    const frames = Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', clip]).toString().trim())
    const summary = r.tracks.map((t) => ({ object_id: t.object_id, n_frames: t.n_frames, first_seen: t.first_seen, last_seen: t.last_seen, span_s: +(t.last_seen - t.first_seen).toFixed(1), gaps_s: gapsOf(t), max_conf: t.confidence }))
    console.log(`${clip}: ${frames} frames, ${r.records} detections, ${r.tracks.length} tracks, ${r.seconds.toFixed(1)}s wall`)
    for (const s of summary) console.log(`  #${s.object_id}: ${s.n_frames}f  ${s.first_seen}s→${s.last_seen}s  gaps>0.5s: ${s.gaps_s.join(', ') || '—'}`)
    writeJson(out, { clip: path.basename(clip), fps, frames_billed: Math.max(frames, 50), usd: computeUsd({ ...emptyCost(), sam_frames: Math.max(frames, 50) }), wall_s: r.seconds, n_detections: r.records, tracks: r.tracks, summary })
    fs.writeFileSync(out.replace(/\.json$/, '.raw.txt'), r.raw)
  } else if (cmd === 'crops') {
    const clip = opt('clip')!, dir = opt('dir')!, per = Number(opt('per', '4'))
    const { tracks } = JSON.parse(fs.readFileSync(opt('tracks')!, 'utf8')) as { tracks: Track[] }
    fs.mkdirSync(dir, { recursive: true })
    for (const t of tracks) {
      const dets = t.detections.filter((d) => (d.box.x2 - d.box.x1) * (d.box.y2 - d.box.y1) > 900) // skip slivers < 30x30 px
      if (dets.length === 0) continue
      const picks = [...new Set(Array.from({ length: Math.min(per, dets.length) }, (_, i) => Math.round((i * (dets.length - 1)) / Math.max(per - 1, 1))))]
      for (const i of picks) crop(clip, dets[i].t, dets[i].box, path.join(dir, `t${t.object_id}_f${dets[i].frame}.jpg`))
    }
    console.log(`crops in ${dir}: ${fs.readdirSync(dir).length}`)
  } else if (cmd === 'match') {
    /** cases: [{ owner, pet: {name, species, description}, positives: [...], negatives: [...] }] */
    const cases = JSON.parse(fs.readFileSync(opt('cases')!, 'utf8'))
    const trials = Number(opt('trials', '1'))
    const rows: any[] = []
    let tin = 0, tout = 0
    for (const c of cases) {
      const ownerB64 = b64(c.owner)
      const jobs = [...c.positives.map((p: string) => [p, true]), ...c.negatives.map((p: string) => [p, false])] as Array<[string, boolean]>
      for (let k = 0; k < trials; k++) {
        const results = await Promise.all(jobs.map(async ([still, want]) => {
          const content = matchPrompt({ ...c.pet, photo_key: '' }, c.transcript ?? null, path.basename(still))
          content.push({ type: 'input_image', image_url: ownerB64 }, { type: 'input_image', image_url: b64(still) })
          const r = await sparkStructured(env, content, 'match_verdict', MATCH_SCHEMA)
          tin += r.usage.input; tout += r.usage.output
          return { case: c.name, trial: k + 1, still: path.basename(still), want_match: want, is_match: !!r.parsed.is_match, confidence: Number(r.parsed.confidence), rationale: String(r.parsed.rationale) }
        }))
        rows.push(...results)
      }
    }
    const tp = rows.filter((r) => r.want_match && r.is_match).length
    const fn = rows.filter((r) => r.want_match && !r.is_match).length
    const fp = rows.filter((r) => !r.want_match && r.is_match).length
    const tn = rows.filter((r) => !r.want_match && !r.is_match).length
    // Ranking view (what the owner actually sees): is the true pet the top-scored candidate?
    const ranking = cases.map((c: any) => {
      const mine = rows.filter((r) => r.case === c.name)
      const bestNeg = Math.max(...mine.filter((r) => !r.want_match).map((r) => (r.is_match ? r.confidence : 0)), 0)
      const pos = mine.filter((r) => r.want_match).map((r) => (r.is_match ? r.confidence : 0))
      return { case: c.name, positives_above_every_negative: pos.filter((p) => p > bestNeg).length, positives: pos.length }
    })
    const metrics = {
      model: env.SPARK_MODEL, n: rows.length, tp, fn, fp, tn,
      accuracy: +((tp + tn) / rows.length).toFixed(3),
      precision: tp + fp ? +(tp / (tp + fp)).toFixed(3) : null,
      recall: tp + fn ? +(tp / (tp + fn)).toFixed(3) : null,
      ranking,
      usd: +computeUsd({ ...emptyCost(), spark_in: tin, spark_out: tout }).toFixed(4),
      tokens: { input: tin, output: tout },
    }
    console.log(JSON.stringify(metrics, null, 2))
    for (const r of rows) console.log(`${r.want_match === r.is_match ? 'ok ' : 'ERR'} ${r.case} ${r.still} want=${r.want_match ? 'match' : 'reject'} got=${r.is_match ? 'match' : 'reject'} conf=${r.confidence.toFixed(2)} — ${r.rationale.slice(0, 90)}`)
    writeJson(opt('out')!, { run_at: new Date().toISOString(), metrics, rows })
  } else if (cmd === 'plan') {
    const pet = { name: opt('name', 'Biscuit')!, species: 'dog', description: opt('description', '')!, photo_key: '' }
    const sightings = JSON.parse(fs.readFileSync(opt('sightings')!, 'utf8'))
    let plan: any = null, posterBytes = 0
    const t0 = Date.now()
    const { summary, calls } = await toolLoop(env, coordinatorInput(pet, opt('transcript') ?? null, sightings, b64(opt('sighting')!)), TOOLS, {
      suggest_next_search: async (a) => { plan = a; return 'plan recorded' },
      make_poster: async (a) => {
        const r = await generatePoster(env, posterPrompt(a))
        posterBytes = r.png.byteLength
        const out = opt('poster')
        if (out) fs.writeFileSync(out, new Uint8Array(r.png))
        return 'poster generated'
      },
    })
    const result = { run_at: new Date().toISOString(), model: env.SPARK_MODEL, wall_s: (Date.now() - t0) / 1000, tool_calls: calls, plan, poster_bytes: posterBytes, summary }
    console.log(JSON.stringify(result, null, 2))
    writeJson(opt('out')!, result)
  } else {
    console.error('usage: node eval/benchmark.ts track|crops|match|plan ...')
    process.exit(2)
  }
}

main().catch((e) => { console.error('BENCHMARK FAIL:', e?.message ?? e); process.exit(1) })
