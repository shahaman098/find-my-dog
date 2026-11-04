import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { Clip, Env, MatchVerdict, PipelineMessage, ReportState, Sighting } from './types'
import { createState, readState, updateState } from './store.ts'
import { emptyCost, addCost } from './cost.ts'
import { mockTracks, mockTranscript, mockMatch, mockPlan, MOCK_POSTER_SVG } from './mock.ts'
import { trackVideo, uploadVideo, isPublicUrl, sparkStructured, glimmerStructured, toolLoop, transcribe, generatePoster, type ContentPart } from './meta.ts'
import { byClock } from './clock.ts'
import { MATCH_SCHEMA, matchPrompt, TOOLS, coordinatorInput, posterPrompt } from './prompts.ts'

const app = new Hono<{ Bindings: Env }>()

// Judges should never see a bare 500 — always JSON, always readable.
app.onError((err, c) => c.json({ error: String(err?.message ?? err).slice(0, 400) }, 500))

function mockMode(env: Env): boolean {
  return env.FMD_MOCK === '1' || !env.META_API_KEY
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const newId = () => randomHex(6)

/** Cloudflare's request-body ceiling on Free/Pro plans; reject earlier with a readable error. */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

/** Who may change a report:
 *  - the seeded demo report is read-only for everyone (judges can't break it, or burn credits on it);
 *  - owner-only actions need the X-Owner-Token issued at creation (legacy reports without one stay open);
 *  - anyone holding the neighbor link may add a clip. */
function ownerTokenMatches(expected: string, given: string | undefined): boolean {
  if (!given) return false
  const a = new TextEncoder().encode(expected)
  const b = new TextEncoder().encode(given)
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b)
}

const notDemo = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (c.env.DEMO_REPORT_ID && c.req.param('id') === c.env.DEMO_REPORT_ID) {
    return c.json({ error: 'This is the read-only demo report. Start your own report to run the full pipeline.' }, 403)
  }
  await next()
})

const ownerOnly = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const id = c.req.param('id') ?? ''
  if (c.env.DEMO_REPORT_ID && id === c.env.DEMO_REPORT_ID) {
    return c.json({ error: 'This is the read-only demo report. Start your own report to run the full pipeline.' }, 403)
  }
  const s = await readState(c.env.DB, id)
  if (!s) return c.json({ error: 'report not found' }, 404)
  if (s.owner_token && !ownerTokenMatches(s.owner_token, c.req.header('X-Owner-Token'))) {
    return c.json({ error: 'Only the owner can do this. Open the report on the device that filed it.' }, 403)
  }
  await next()
})

function freshState(reportId: string): ReportState {
  return {
    report_id: reportId,
    created_at: Date.now(),
    owner_token: randomHex(16),
    pet: { name: '', species: 'dog', description: '', photo_key: '' },
    transcript: null,
    transcript_error: null,
    clips: [],
    matches: [],
    next_search: null,
    summary: null,
    poster_key: null,
    matcher_model: null,
    cost: emptyCost(),
  }
}

// ---- reports ----

app.post('/api/reports', async (c) => {
  const form = await c.req.formData()
  const state = freshState(newId())
  state.pet.name = String(form.get('pet_name') ?? '')
  state.pet.species = String(form.get('species') ?? 'dog')
  state.pet.description = String(form.get('description') ?? '')
  const photo = form.get('photo') as File | null
  if (!photo || photo.size === 0) return c.json({ error: 'photo required' }, 400)
  if (photo.type && !photo.type.startsWith('image/')) return c.json({ error: 'photo must be an image' }, 400)
  state.pet.photo_key = `${state.report_id}/pet_photo.jpg`
  await c.env.MEDIA.put(state.pet.photo_key, photo, { httpMetadata: { contentType: photo.type || 'image/jpeg' } })

  const voice = form.get('voice_note') as File | null
  if (voice && voice.size > 0) {
    try {
      if (mockMode(c.env)) {
        state.transcript = mockTranscript()
      } else {
        const wav = await voice.arrayBuffer() // client encodes WAV; ASR requires WAV
        const t = await transcribe(c.env, wav)
        state.transcript = t.transcript
        addCost(state, { asr_seconds: t.seconds })
      }
    } catch (e) {
      state.transcript_error = String(e).slice(0, 300)
    }
  }
  await createState(c.env.DB, state)
  // The only response that ever carries the owner token.
  return c.json({ ...publicState(state), owner_token: state.owner_token })
})

app.get('/api/reports/:id', async (c) => {
  const s = await readState(c.env.DB, c.req.param('id'))
  if (!s) return c.json({ error: 'report not found' }, 404)
  return c.json({ ...publicState(s), demo: s.report_id === c.env.DEMO_REPORT_ID })
})

function publicState(s: ReportState) {
  const { owner_token: _secret, ...rest } = s
  return {
    ...rest,
    pet: { ...s.pet, photo_url: `/api/reports/${s.report_id}/pet_photo` },
    poster_url: s.poster_key ? `/api/reports/${s.report_id}/poster` : null,
    demo: false as boolean,
  }
}

app.get('/api/reports/:id/pet_photo', async (c) => {
  const s = await readState(c.env.DB, c.req.param('id'))
  if (!s) return c.json({ error: 'not found' }, 404)
  const obj = await c.env.MEDIA.get(s.pet.photo_key)
  if (!obj) return c.json({ error: 'not found' }, 404)
  return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg' } })
})

// stills (client-side cropped from the clip, uploaded here)
app.put('/api/reports/:id/stills/:clipId/:objectId', ownerOnly, async (c) => {
  const { id, clipId, objectId } = c.req.param()
  const s = await readState(c.env.DB, id)
  if (!s) return c.json({ error: 'not found' }, 404)
  const key = `${id}/stills/${clipId}_${objectId}.jpg`
  await c.env.MEDIA.put(key, await c.req.arrayBuffer(), { httpMetadata: { contentType: 'image/jpeg' } })
  return c.json({ key })
})

async function still(obj: R2ObjectBody, fallback: string): Promise<Response> {
  // Mock placeholders are SVG; real stills are JPEG. R2 httpMetadata round-trips
  // unreliably across runtimes, so sniff the first byte of the body instead.
  const buf = await obj.arrayBuffer()
  const isSvg = new Uint8Array(buf)[0] === 0x3c // '<'
  return new Response(buf, {
    headers: { 'Content-Type': isSvg ? 'image/svg+xml' : (obj.httpMetadata?.contentType ?? fallback) },
  })
}

app.get('/api/reports/:id/stills/:clipId/:objectId', async (c) => {
  const { id, clipId, objectId } = c.req.param()
  const obj = await c.env.MEDIA.get(`${id}/stills/${clipId}_${objectId}.jpg`)
  if (!obj) return c.json({ error: 'not found' }, 404)
  return still(obj, 'image/jpeg')
})

// ---- clips ----

app.post('/api/reports/:id/clips', notDemo, async (c) => {
  const s = await readState(c.env.DB, c.req.param('id'))
  if (!s) return c.json({ error: 'report not found' }, 404)
  const form = await c.req.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return c.json({ error: 'file required' }, 400)
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: 'clip too large (100 MB max) — trim it to the moments around the sighting' }, 413)
  if (file.type && !file.type.startsWith('video/')) return c.json({ error: 'clip must be a video file' }, 400)
  const clipId = newId()
  const key = `${s.report_id}/clips/${clipId}_${file.name.replace(/[^\w.-]/g, '_')}`
  await c.env.MEDIA.put(key, file, { httpMetadata: { contentType: file.type || 'video/mp4' } })
  // fps/duration come from the client (mp4box); defaults are honest fallbacks.
  const fps = Number(form.get('fps')) || 30
  const duration = Number(form.get('duration')) || 0
  const origin = new URL(c.req.url).origin
  const clip: Clip = {
    clip_id: clipId,
    filename: file.name,
    label: String(form.get('label') || file.name),
    captured_clock: String(form.get('captured_clock') || ''),
    fps,
    duration_s: duration,
    media_url: `${origin}/api/reports/${s.report_id}/clips/${clipId}`,
    status: 'queued',
    error: null,
    tracks: [],
    n_tracks: 0,
    still_done: false,
  }
  await updateState(c.env.DB, s.report_id, (st) => st.clips.push(clip))
  await c.env.PIPELINE.send({ reportId: s.report_id, clipId })
  return c.json(clip)
})

// media serving (public URL for SAM video_url + client players)
app.get('/api/reports/:id/clips/:clipId', async (c) => {
  const { id, clipId } = c.req.param()
  const s = await readState(c.env.DB, id)
  const clip = s?.clips.find((cl) => cl.clip_id === clipId)
  if (!s || !clip) return c.json({ error: 'not found' }, 404)
  // stored under {report}/clips/{clip_id}_{filename}
  const list = await c.env.MEDIA.list({ prefix: `${id}/clips/${clipId}_` })
  const obj = list.objects[0] ? await c.env.MEDIA.get(list.objects[0].key) : null
  if (!obj) return c.json({ error: 'media missing' }, 404)
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'video/mp4',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

app.delete('/api/reports/:id/clips/:clipId', ownerOnly, async (c) => {
  const { id, clipId } = c.req.param()
  const st = await updateState(c.env.DB, id, (s) => {
    s.clips = s.clips.filter((cl) => cl.clip_id !== clipId)
    s.matches = s.matches.filter((m) => m.clip_id !== clipId)
  })
  // Withdrawn footage is actually deleted, not just hidden.
  const [media, stills] = await Promise.all([
    c.env.MEDIA.list({ prefix: `${id}/clips/${clipId}_` }),
    c.env.MEDIA.list({ prefix: `${id}/stills/${clipId}_` }),
  ])
  const keys = [...media.objects, ...stills.objects].map((o) => o.key)
  if (keys.length) await c.env.MEDIA.delete(keys)
  return c.json(publicState(st))
})

app.patch('/api/reports/:id/clips/:clipId', ownerOnly, async (c) => {
  const { id, clipId } = c.req.param()
  const s = await readState(c.env.DB, id)
  if (!s) return c.json({ error: 'report not found' }, 404)
  if (!s.clips.some((x) => x.clip_id === clipId)) return c.json({ error: 'clip not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  return c.json(publicState(await updateState(c.env.DB, id, (s) => {
    const cl = s.clips.find((x) => x.clip_id === clipId)
    if (!cl) return
    if (typeof body.label === 'string') cl.label = body.label
    if (typeof body.captured_clock === 'string') cl.captured_clock = body.captured_clock
    if (typeof body.fps === 'number' && body.fps > 0) cl.fps = body.fps
    if (typeof body.duration === 'number' && body.duration > 0) cl.duration_s = body.duration
    if (body.still_done === true) cl.still_done = true
  })))
})

// ---- matching ----

app.post('/api/reports/:id/match', ownerOnly, async (c) => {
  const s0 = await readState(c.env.DB, c.req.param('id'))
  if (!s0) return c.json({ error: 'report not found' }, 404)
  const candidates: Array<{ clip: Clip; objectId: number }> = []
  for (const clip of s0.clips) {
    for (const t of clip.tracks) {
      const still = await c.env.MEDIA.head(`${s0.report_id}/stills/${clip.clip_id}_${t.object_id}.jpg`)
      if (t.n_frames > 0 && still) candidates.push({ clip, objectId: t.object_id })
    }
  }
  if (candidates.length === 0) return c.json({ error: 'no tracked animals yet — ingest clips first' }, 400)

  if (mockMode(c.env)) {
    const verdicts: MatchVerdict[] = candidates.map(({ clip, objectId }) => {
      const v = mockMatch(`${clip.clip_id}:${objectId}`)
      return { clip_id: clip.clip_id, object_id: objectId, is_match: v.is_match, score: v.confidence, rationale: v.rationale, confirmed: null }
    })
    const st = await updateState(c.env.DB, s0.report_id, (s) => {
      s.matches = keepConfirmations(s.matches, verdicts)
      s.matcher_model = 'mock'
    })
    return c.json(publicState(st))
  }

  const verdicts: MatchVerdict[] = []
  let modelUsed = ''
  const usage = { input: 0, output: 0 }
  const petPhotoB64 = await b64Of(c.env, s0.pet.photo_key)

  // One LLM call per candidate track, run in parallel — serial calls made judges wait.
  const prepared = await Promise.all(
    candidates.map(async ({ clip, objectId }) => ({
      clip_id: clip.clip_id,
      object_id: objectId,
      stillB64: await b64Of(c.env, `${s0.report_id}/stills/${clip.clip_id}_${objectId}.jpg`),
    })),
  )

  try {
    if (c.env.BASETEN_API_KEY) {
      try {
        const glimmerVerdicts = await Promise.all(
          prepared.map(async (p) => {
            const r = await glimmerStructured(
              c.env,
              [
                { type: 'text', text: (matchPrompt(s0.pet, s0.transcript, `${p.clip_id}:${p.object_id}`)[0] as any).text },
                { type: 'image_url', image_url: { url: petPhotoB64 } },
                { type: 'image_url', image_url: { url: p.stillB64 } },
              ],
              'match_verdict',
              MATCH_SCHEMA,
            )
            usage.input += r.usage.input
            usage.output += r.usage.output
            return toVerdict(p.clip_id, p.object_id, r.parsed)
          }),
        )
        verdicts.push(...glimmerVerdicts)
        modelUsed = `glimmer:${c.env.GLIMMER_MODEL}`
      } catch (e) {
        // Glimmer is the cheap path; on any failure fall back to hosted Spark for the whole set.
        console.warn(`glimmer match failed, falling back to spark: ${String(e).slice(0, 200)}`)
        verdicts.length = 0
        usage.input = 0
        usage.output = 0
      }
    }
    if (verdicts.length === 0) {
      const sparkVerdicts = await Promise.all(
        prepared.map(async (p) => {
          const content = matchPrompt(s0.pet, s0.transcript, `${p.clip_id}:${p.object_id}`)
          content.push({ type: 'input_image', image_url: petPhotoB64 })
          content.push({ type: 'input_image', image_url: p.stillB64 })
          const r = await sparkStructured(c.env, content, 'match_verdict', MATCH_SCHEMA)
          usage.input += r.usage.input
          usage.output += r.usage.output
          return toVerdict(p.clip_id, p.object_id, r.parsed)
        }),
      )
      verdicts.push(...sparkVerdicts)
      modelUsed = `spark:${c.env.SPARK_MODEL}`
    }
  } catch (e: any) {
    return c.json({ error: `matcher failed: ${String(e?.message ?? e).slice(0, 300)}` }, 502)
  }
  const st = await updateState(c.env.DB, s0.report_id, (s) => {
    s.matches = keepConfirmations(s.matches, verdicts)
    s.matcher_model = modelUsed
    addCost(s, { spark_in: usage.input, spark_out: usage.output })
  })
  return c.json(publicState(st))
})

/** Re-running the matcher (e.g. after a new clip arrives) must not erase the owner's decisions. */
function keepConfirmations(prev: MatchVerdict[], next: MatchVerdict[]): MatchVerdict[] {
  const decided = new Map(prev.filter((m) => m.confirmed !== null).map((m) => [`${m.clip_id}:${m.object_id}`, m.confirmed]))
  return next.map((m) => ({ ...m, confirmed: decided.get(`${m.clip_id}:${m.object_id}`) ?? null }))
}

/** Trim at a word boundary so rationales never end mid-word ("Low re…"). */
function clipText(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40)).trimEnd() + '…'
}

function toVerdict(clipId: string, objectId: number, parsed: any): MatchVerdict {
  return {
    clip_id: clipId,
    object_id: objectId,
    is_match: !!parsed.is_match,
    score: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    rationale: clipText(String(parsed.rationale ?? ''), 600),
    confirmed: null,
  }
}

async function b64Of(env: Env, key: string): Promise<string> {
  const obj = await env.MEDIA.get(key)
  if (!obj) throw new Error(`missing object ${key}`)
  const buf = await obj.arrayBuffer()
  const mime = obj.httpMetadata?.contentType?.startsWith('image/') ? obj.httpMetadata.contentType : 'image/jpeg'
  let bin = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,` + btoa(bin)
}

app.post('/api/reports/:id/matches/confirm', ownerOnly, async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body.clip_id !== 'string' || typeof body.object_id !== 'number') {
    return c.json({ error: 'clip_id (string) and object_id (number) required' }, 400)
  }
  const { clip_id, object_id, confirmed } = body
  return c.json(publicState(await updateState(c.env.DB, id, (s) => {
    const m = s.matches.find((mm) => mm.clip_id === clip_id && mm.object_id === object_id)
    if (m) m.confirmed = !!confirmed
  })))
})

// ---- timeline + agentic plan ----

function sightingsOf(s: ReportState): Sighting[] {
  const out: Sighting[] = []
  for (const m of s.matches) {
    if (m.confirmed !== true) continue
    const clip = s.clips.find((cl) => cl.clip_id === m.clip_id)
    const track = clip?.tracks.find((t) => t.object_id === m.object_id)
    if (!clip || !track) continue
    out.push({
      clip_id: clip.clip_id,
      object_id: m.object_id,
      place: clip.label,
      clock: clip.captured_clock,
      t_in_clip: track.first_seen,
      duration_seen: Math.round((track.last_seen - track.first_seen) * 10) / 10,
      confidence: m.score,
      still: `/api/reports/${s.report_id}/stills/${m.clip_id}/${m.object_id}`,
      media_url: clip.media_url,
    })
  }
  out.sort((a, b) => byClock(a.clock, b.clock))
  return out
}

app.get('/api/reports/:id/timeline', async (c) => {
  const s = await readState(c.env.DB, c.req.param('id'))
  if (!s) return c.json({ error: 'not found' }, 404)
  return c.json({ sightings: sightingsOf(s), next_search: s.next_search, poster: s.poster_key ? `/api/reports/${s.report_id}/poster` : null, cost: s.cost, summary: s.summary })
})

app.post('/api/reports/:id/analyze', ownerOnly, async (c) => {
  const s0 = await readState(c.env.DB, c.req.param('id'))
  if (!s0) return c.json({ error: 'not found' }, 404)
  const sightings = sightingsOf(s0)
  if (sightings.length === 0) return c.json({ error: 'no confirmed sightings yet' }, 400)

  if (mockMode(c.env)) {
    const plan = mockPlan()
    const key = `${s0.report_id}/poster.png`
    await c.env.MEDIA.put(key, MOCK_POSTER_SVG, { httpMetadata: { contentType: 'image/svg+xml' } })
    const st = await updateState(c.env.DB, s0.report_id, (s) => {
      s.next_search = plan
      s.poster_key = key
      s.summary = `Sighted ${sightings.length} time(s) on neighborhood cameras. Plan recorded and poster ready.`
    })
    return c.json({ next_search: st.next_search, poster: `/api/reports/${st.report_id}/poster`, summary: st.summary, sightings })
  }

  const best = sightings.reduce((a, b) => (a.confidence >= b.confidence ? a : b))
  const bestB64 = await b64Of(c.env, `${s0.report_id}/stills/${best.clip_id}_${best.object_id}.jpg`)
  const input = coordinatorInput(s0.pet, s0.transcript, sightings, bestB64)
  let plan: ReportState['next_search'] = null
  let posterKey: string | null = null
  let images = 0
  let calls: string[] = []
  let summary = ''
  try {
    ;({ summary, calls } = await toolLoop(c.env, input, TOOLS, {
      suggest_next_search: async (args) => {
        plan = args
        return 'plan recorded'
      },
      make_poster: async (args) => {
        const r = await generatePoster(c.env, posterPrompt(args))
        posterKey = `${s0.report_id}/poster`
        await c.env.MEDIA.put(posterKey, r.png, { httpMetadata: { contentType: r.contentType } })
        images++
        return 'poster generated'
      },
    }))
  } catch (e: any) {
    return c.json({ error: `search coordinator failed: ${String(e?.message ?? e).slice(0, 300)}` }, 502)
  }
  const st = await updateState(c.env.DB, s0.report_id, (s) => {
    if (plan) s.next_search = plan
    if (posterKey) s.poster_key = posterKey
    if (summary) s.summary = summary
    addCost(s, { images })
  })
  return c.json({
    next_search: st.next_search,
    poster: st.poster_key ? `/api/reports/${st.report_id}/poster` : null,
    summary: st.summary,
    calls,
    sightings,
  })
})

app.get('/api/reports/:id/poster', async (c) => {
  const s = await readState(c.env.DB, c.req.param('id'))
  const key = s?.poster_key
  if (!s || !key) return c.json({ error: 'no poster yet' }, 404)
  const obj = await c.env.MEDIA.get(key)
  if (!obj) return c.json({ error: 'no poster yet' }, 404)
  return still(obj, 'image/png')
})

// ---- misc ----

app.get('/api/health', (c) =>
  c.json({ ok: true, mock: mockMode(c.env), matcher: c.env.BASETEN_API_KEY ? 'glimmer-available' : 'spark' }),
)

/** Pre-seeded demo report for #/demo (set DEMO_REPORT_ID after seeding on prod). */
app.get('/api/demo', async (c) => {
  const id = c.env.DEMO_REPORT_ID
  if (!id) return c.json({ id: null })
  const s = await readState(c.env.DB, id)
  return c.json({ id: s ? id : null })
})

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<PipelineMessage>, env: Env, _ctx: ExecutionContext) {
    for (const msg of batch.messages) {
      const { reportId, clipId } = msg.body
      const setClip = (fn: (cl: Clip) => void) =>
        updateState(env.DB, reportId, (s) => {
          const cl = s.clips.find((x) => x.clip_id === clipId)
          if (cl) fn(cl)
        })
      try {
        const s = await readState(env.DB, reportId)
        const clip = s?.clips.find((x) => x.clip_id === clipId)
        if (!s || !clip) {
          msg.ack()
          continue
        }
        // SAM 3.1 takes a noun-phrase concept; "animal" covers rabbits, ferrets, etc.
        const concept = s.pet.species === 'cat' ? 'cat' : s.pet.species === 'dog' ? 'dog' : 'animal'
        if (mockMode(env)) {
          await setClip((cl) => {
            cl.status = 'tracking'
          })
          const tracks = mockTracks()
          // Placeholder stills so matching works without a browser session.
          const placeholder = '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="200"><rect width="260" height="200" fill="#234"/><text x="130" y="105" font-size="20" fill="#cde" text-anchor="middle" font-family="sans-serif">mock track</text></svg>'
          for (const t of tracks) {
            await env.MEDIA.put(`${reportId}/stills/${clipId}_${t.object_id}.jpg`, placeholder, { httpMetadata: { contentType: 'image/svg+xml' } })
          }
          await setClip((cl) => {
            cl.tracks = tracks
            cl.n_tracks = tracks.length
            cl.status = 'done'
            cl.still_done = true
          })
        } else {
          await setClip((cl) => {
            cl.status = 'tracking'
          })
          // Public deployments pass the clip URL; a URL SAM can't reach (e.g. wrangler dev on localhost) is uploaded
          // to the Meta Files API first, so the full real pipeline runs anywhere.
          let video: { url: string } | { fileId: string } = { url: clip.media_url }
          if (!isPublicUrl(clip.media_url)) {
            const list = await env.MEDIA.list({ prefix: `${reportId}/clips/${clipId}_` })
            const obj = list.objects[0] ? await env.MEDIA.get(list.objects[0].key) : null
            if (!obj) throw new Error('clip media missing in R2')
            video = { fileId: await uploadVideo(env, await obj.arrayBuffer(), clip.filename || `${clipId}.mp4`, obj.httpMetadata?.contentType ?? 'video/mp4') }
          }
          const tracks = await trackVideo(env, video, concept, clip.fps)
          // SAM bills a 50-frame minimum per request (sam.ts samCost) — honor it in the meter.
          const framesBilled = Math.max(Math.round(clip.fps * clip.duration_s), 50)
          await setClip((cl) => {
            cl.tracks = tracks
            cl.n_tracks = tracks.length
            cl.status = 'done'
            cl.error = null
          })
          await updateState(env.DB, reportId, (st) => addCost(st, { sam_frames: framesBilled }))
        }
        msg.ack()
      } catch (e) {
        // max_retries is 2 (wrangler.jsonc), so attempts 1–2 will be retried; show "error" only on the last.
        const finalAttempt = msg.attempts >= 3
        await setClip((cl) => {
          cl.status = finalAttempt ? 'error' : 'queued'
          cl.error = finalAttempt ? String(e).slice(0, 400) : `retrying after: ${String(e).slice(0, 200)}`
        }).catch(() => {})
        if (finalAttempt) msg.ack()
        else msg.retry({ delaySeconds: 5 })
      }
    }
  },
}
