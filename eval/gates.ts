/** Hackathon gates — run before committing the night to this idea. Real API required.
 *
 * G1: SAM 3.1 must track one animal with a persistent ID spanning most of a clip
 *     (gaps inside the span = identity survived an absence/occlusion).
 * G2: Spark must pick the right animal from an owner photo + cross-clip stills,
 *     >= 8/10 trials, and reject the distractor.
 *
 * Usage: node eval/gates.ts g1 --clip eval/fixtures/dog_clip.mp4 [--concept dog]
 *        node eval/gates.ts g2 --owner eval/fixtures/owner.jpg --same still_a.jpg still_b.jpg --different other_animal.jpg
 * Requires META_API_KEY in .dev.vars (load with: export $(grep -v '^#' .dev.vars | xargs))
 */
const BASE = process.env.META_BASE_URL ?? 'https://api.meta.ai/v1'
const KEY = process.env.META_API_KEY
const SPARK = process.env.SPARK_MODEL ?? 'muse-spark-1.3'

if (!KEY) {
  console.error('META_API_KEY missing. Put it in .dev.vars and: export $(grep -v "^#" .dev.vars | xargs)')
  process.exit(2)
}

const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
async function b64(p) {
  const fs = await import('node:fs')
  return 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64')
}

async function uploadVideo(path) {
  const fs = await import('node:fs')
  const form = new FormData()
  form.append('file', new Blob([fs.readFileSync(path)], { type: 'video/mp4' }), path.split('/').pop())
  const r = await fetch(`${BASE}/files`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form })
  if (!r.ok) throw new Error(`upload ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()).id
}

// (parser duplicated from worker/src/sam.ts — gates run in plain node, outside wrangler)
const FRAME_RE = /<(\d+)f>/g
const RECORD_RE = /(\d+)<\|box;x1=(-?\d+);y1=(-?\d+);x2=(-?\d+);y2=(-?\d+);w=(\d+);h=(\d+)(?:;c=([\d.]+))?\|>/g
function parseSegmentation(text) {
  const out = []
  const parts = []
  let last = 0
  for (const m of text.matchAll(FRAME_RE)) { parts.push(text.slice(last, m.index), m[1]); last = m.index + m[0].length }
  parts.push(text.slice(last))
  for (let i = 1; i < parts.length - 1; i += 2) {
    const frame = +parts[i]
    for (const m of parts[i + 1].matchAll(RECORD_RE)) {
      out.push({ frame, object_id: +m[1], box: { x1: +m[2], y1: +m[3], x2: +m[4], y2: +m[5], w: +m[6], h: +m[7] }, confidence: m[8] ? +m[8] : null })
    }
  }
  return out
}

function mergeTracks(records, fps) {
  const byId = new Map()
  for (const r of records) {
    const dets = byId.get(r.object_id) ?? []
    dets.push({ t: r.frame / fps, confidence: r.confidence })
    byId.set(r.object_id, dets)
  }
  return [...byId.entries()]
    .map(([object_id, dets]) => ({ object_id, n: dets.length, first: dets[0].t, last: dets[dets.length - 1].t, dets }))
    .sort((a, b) => a.first - b.first)
}

async function g1(clip, concept, fps) {
  console.log(`== G1: SAM 3.1 persistence over ${clip} (concept: ${concept}) ==`)
  const fileId = await uploadVideo(clip)
  // SAM can take video_url too, but file_id avoids URL reachability in local runs.
  const r = await fetch(`${BASE}/responses`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      model: 'sam-3.1',
      input: [{ type: 'message', role: 'user', content: [
        { type: 'input_text', text: concept },
        { type: 'input_video', file_id: fileId },
      ] }],
      stream: true,
    }),
  })
  if (!r.ok || !r.body) throw new Error(`sam ${r.status}: ${(await r.text()).slice(0, 300)}`)
  let text = ''
  {
    const dec = new TextDecoder()
    let buf = ''
    for (const reader = r.body.getReader(); ;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const events = buf.split('\n\n')
      buf = events.pop() ?? ''
      for (const evt of events) {
        for (const line of evt.split('\n')) {
          if (!line.startsWith('data:')) continue
          const d = line.slice(5).trim()
          if (d === '[DONE]') continue
          try {
            const j = JSON.parse(d)
            if (j.type === 'response.output_text.delta' && j.delta) text += j.delta
          } catch { /* partial */ }
        }
      }
    }
  }
  const records = parseSegmentation(text)
  if (records.length === 0) { console.log('G1 FAIL: no records'); return 1 }
  const tracks = mergeTracks(records, fps)
  const duration = Math.max(...tracks.map((t) => t.last), 0.1)
  console.log(`frames with detections: ${records.length}, tracks: ${tracks.length}`)
  for (const t of tracks) {
    const span = t.last - t.first
    console.log(`  track ${t.object_id}: ${t.n} frames, ${t.first.toFixed(1)}s -> ${t.last.toFixed(1)}s (span ${span.toFixed(1)}s, ${((span / duration) * 100).toFixed(0)}%)`)
  }
  const best = tracks.reduce((a, b) => (b.last - b.first > a.last - a.first ? b : a))
  const span = best.last - best.first
  const ts = best.dets.map((d) => d.t)
  const gaps = []
  for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > 1.0) gaps.push(+(ts[i] - ts[i - 1]).toFixed(2))
  const ok = span >= 0.6 * duration && best.n >= 10
  console.log(`  best track span ${span.toFixed(1)}s / ${duration.toFixed(1)}s; gaps>1s inside span: ${gaps.length ? gaps.join(', ') : 'none'}`)
  console.log(ok ? 'G1 PASS' : 'G1 FAIL (span <60% or <10 frames)')
  return ok ? 0 : 1
}

async function sparkVerdict(ownerPath, stillPath) {
  const r = await fetch(`${BASE}/responses`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      model: SPARK,
      input: [{ type: 'message', role: 'user', content: [
        { type: 'input_text', text: 'Image 1 is the owner\'s reference photo of their lost dog, Biscuit: a medium-size tan dog with a white chest patch and a curled tail. Image 2 is one detection cropped from neighborhood camera footage. Is the animal in image 2 plausibly Biscuit? Judge by robust appearance attributes only.' },
        { type: 'input_image', image_url: await b64(ownerPath) },
        { type: 'input_image', image_url: await b64(stillPath) },
      ] }],
      text: { format: { type: 'json_schema', name: 'verdict', schema: { type: 'object', properties: { is_match: { type: 'boolean' }, confidence: { type: 'number' }, rationale: { type: 'string' } }, required: ['is_match', 'confidence', 'rationale'] }, strict: true } },
    }),
  })
  if (!r.ok) throw new Error(`spark ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const j = await r.json()
  return JSON.parse(j.output_text)
}

async function g2(owner, same, different, trials) {
  console.log(`== G2: Spark matching, ${trials} trials ==`)
  const fs = await import('node:fs')
  if (!fs.existsSync(owner)) { console.log(`G2 setup: owner photo missing (${owner}) — extract a clear frame from the fixture as the reference`); return 2 }
  let correct = 0
  for (let i = 0; i < trials; i++) {
    const wantSame = different.length === 0 || i < Math.ceil(trials / 2)
    const still = wantSame ? same[i % same.length] : different[i % different.length]
    const v = await sparkVerdict(owner, still)
    const got = v.is_match && v.confidence >= 0.5
    correct += wantSame === got
    console.log(`  trial ${i + 1}: ${still.split('/').pop()} want=${wantSame ? 'MATCH' : 'REJECT'} got=${got ? 'MATCH' : 'REJECT'} conf=${v.confidence?.toFixed?.(2)} — ${String(v.rationale).slice(0, 70)}`)
  }
  console.log(`accuracy: ${correct}/${trials}`)
  console.log(correct >= 8 ? 'G2 PASS' : 'G2 FAIL (<8/10)')
  return correct >= 8 ? 0 : 1
}

// CLI
const args = process.argv.slice(2)
const gate = args[0]
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : dflt
}
const list = (name) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return []
  const out = []
  for (let k = i + 1; k < args.length && !args[k].startsWith('--'); k++) out.push(args[k])
  return out
}

if (gate === 'g1') {
  const clip = opt('clip')
  const fps = Number(opt('fps', '3'))
  if (!clip) { console.error('usage: node eval/gates.ts g1 --clip <file> [--fps 3]'); process.exit(2) }
  g1(clip, opt('concept', 'dog'), fps).then((c) => process.exit(c))
} else if (gate === 'g2') {
  const owner = opt('owner')
  const same = list('same')
  const different = list('different')
  g2(owner, same, different, Number(opt('trials', '10'))).then((c) => process.exit(c))
} else {
  console.error('usage: node eval/gates.ts g1|g2 ...')
  process.exit(2)
}
