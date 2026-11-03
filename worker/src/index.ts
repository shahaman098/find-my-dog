import { Hono } from 'hono'
import type { Clip, Env, MatchVerdict, PipelineMessage, ReportState, Sighting } from './types'
import { createState, readState, updateState } from './store'
import { emptyCost, addCost } from './cost'
import { mockTracks, mockTranscript, mockMatch, mockPlan, MOCK_POSTER_SVG } from './mock'
import { trackVideo, sparkStructured, glimmerStructured, toolLoop, transcribe, generatePoster, type ContentPart } from './meta'

const app = new Hono<{ Bindings: Env }>()

// Judges should never see a bare 500 — always JSON, always readable.
app.onError((err, c) => c.json({ error: String(err?.message ?? err).slice(0, 400) }, 500))

function mockMode(env: Env): boolean {
  return env.FMD_MOCK === '1' || !env.META_API_KEY
}

function newId(): string {
  const a = new Uint8Array(6)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function freshState(reportId: string): ReportState {
  return {
    report_id: reportId,
    created_at: Date.now(),
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
  if (!photo) return c.json({ error: 'photo required' }, 400)
  state.pet.photo_key = `${state.report_id}/pet_photo.jpg`
  await c.env.MEDIA.put(state.pet.photo_key, await photo.arrayBuffer(), { httpMetadata: { contentType: photo.type || 'image/jpeg' } })

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
  return c.json(publicState(state))
})

app.get('/api/reports/:id', async (c) => {
  const s = await readState(c.env.DB, c.req.param('id'))
  if (!s) return c.json({ error: 'report not found' }, 404)
  return c.json(publicState(s))
})

function publicState(s: ReportState) {
  return { ...s, pet: { ...s.pet, photo_url: `/api/reports/${s.report_id}/pet_photo` } }
}

app.get('/api/reports/:id/pet_photo', async (c) => {
  const s = await readState(c.env.DB, c.req.param('id'))
  if (!s) return c.json({ error: 'not found' }, 404)
  const obj = await c.env.MEDIA.get(s.pet.photo_key)
  if (!obj) return c.json({ error: 'not found' }, 404)
  return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg' } })
})

// stills (client-side cropped from the clip, uploaded here)
app.put('/api/reports/:id/stills/:clipId/:objectId', async (c) => {
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

app.post('/api/reports/:id/clips', async (c) => {
  const s = await readState(c.env.DB, c.req.param('id'))
  if (!s) return c.json({ error: 'report not found' }, 404)
  const form = await c.req.formData()
  const file = form.get('file') as File | null
  if (!file) return c.json({ error: 'file required' }, 400)
  const clipId = newId()
  const key = `${s.report_id}/clips/${clipId}_${file.name.replace(/[^\w.-]/g, '_')}`
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'video/mp4' } })
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
  const key = clip.filename ? `${id}/clips/` : ''
  // stored under {report}/clips/{clip_id}_{filename}
  const list = await c.env.MEDIA.list({ prefix: `${id}/clips/${clipId}_` })
  const obj = list.objects[0] ? await c.env.MEDIA.get(list.objects[0].key) : null
  if (!obj) return c.json({ error: 'media missing' }, 404)
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'video/mp4',
      'Cache-Control': 'public, max-age=3600',
      'X-Media-Key': key,
    },
  })
})

app.delete('/api/reports/:id/clips/:clipId', async (c) => {
  const { id, clipId } = c.req.param()
  return c.json(await updateState(c.env.DB, id, (s) => {
    s.clips = s.clips.filter((cl) => cl.clip_id !== clipId)
    s.matches = s.matches.filter((m) => m.clip_id !== clipId)
  }))
})

app.patch('/api/reports/:id/clips/:clipId', async (c) => {
  const { id, clipId } = c.req.param()
  const s = await readState(c.env.DB, id)
  if (!s) return c.json({ error: 'report not found' }, 404)
  if (!s.clips.some((x) => x.clip_id === clipId)) return c.json({ error: 'clip not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  return c.json(await updateState(c.env.DB, id, (s) => {
    const cl = s.clips.find((x) => x.clip_id === clipId)
    if (!cl) return
    if (typeof body.label === 'string') cl.label = body.label
    if (typeof body.captured_clock === 'string') cl.captured_clock = body.captured_clock
    if (typeof body.fps === 'number' && body.fps > 0) cl.fps = body.fps
    if (typeof body.duration === 'number' && body.duration > 0) cl.duration_s = body.duration
    if (body.still_done === true) cl.still_done = true
  }))
})

// ---- matching ----

const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    is_match: { type: 'boolean' },
    confidence: { type: 'number' },
    rationale: { type: 'string' },
  },
  required: ['is_match', 'confidence', 'rationale'],
}

function matchPrompt(pet: ReportState['pet'], transcript: string | null, trackRef: string): ContentPart[] {
  let desc = pet.description
  if (transcript) desc += `\nOwner's voice note: "${transcript}"`
  return [
    {
      type: 'input_text',
      text:
        `Lost pet report. Name: ${pet.name}. Species: ${pet.species}.\nDescription: ${desc}\n\n` +
        `Image 1 is the owner's reference photo of ${pet.name}. Image 2 is one detection (${trackRef}) cropped from neighborhood camera footage.\n` +
        `Decide whether the animal in image 2 could be ${pet.name}. Judge by robust appearance attributes ` +
        `(coat color/pattern, size, build, markings, ear/tail shape). If image 2 shows no animal or an unusable crop, is_match=false with low confidence.`,
    },
  ] as ContentPart[]
}

app.post('/api/reports/:id/match', async (c) => {
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
      s.matches = verdicts
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
    s.matches = verdicts
    s.matcher_model = modelUsed
    addCost(s, { spark_in: usage.input, spark_out: usage.output })
  })
  return c.json(publicState(st))
})

function toVerdict(clipId: string, objectId: number, parsed: any): MatchVerdict {
  return {
    clip_id: clipId,
    object_id: objectId,
    is_match: !!parsed.is_match,
    score: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    rationale: String(parsed.rationale ?? '').slice(0, 300),
    confirmed: null,
  }
}

async function b64Of(env: Env, key: string): Promise<string> {
  const obj = await env.MEDIA.get(key)
  if (!obj) throw new Error(`missing object ${key}`)
  const buf = await obj.arrayBuffer()
  let bin = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return 'data:image/jpeg;base64,' + btoa(bin)
}

app.post('/api/reports/:id/matches/confirm', async (c) => {
  const { id } = c.req.param()
  const { clip_id, object_id, confirmed } = await c.req.json()
  return c.json(await updateState(c.env.DB, id, (s) => {
    const m = s.matches.find((mm) => mm.clip_id === clip_id && mm.object_id === object_id)
    if (m) m.confirmed = !!confirmed
  }))
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
  out.sort((a, b) => (a.clock < b.clock ? -1 : 1))
  return out
}

app.get('/api/reports/:id/timeline', async (c) => {
  const s = await readState(c.env.DB, c.req.param('id'))
  if (!s) return c.json({ error: 'not found' }, 404)
  return c.json({ sightings: sightingsOf(s), next_search: s.next_search, poster: s.poster_key ? `/api/reports/${s.report_id}/poster` : null, cost: s.cost, summary: s.summary })
})

const TOOLS = [
  {
    type: 'function',
    name: 'suggest_next_search',
    description: 'Record the recommended next search plan for the owner, based on the sighting pattern.',
    parameters: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        window: { type: 'string' },
        area: { type: 'string' },
        why: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' } },
      },
      required: ['headline', 'window', 'area', 'why', 'steps'],
    },
  },
  {
    type: 'function',
    name: 'make_poster',
    description: 'Generate a shareable lost-pet alert poster image.',
    parameters: {
      type: 'object',
      properties: { poster_prompt: { type: 'string' }, headline_text: { type: 'string' } },
      required: ['poster_prompt', 'headline_text'],
    },
  },
]

app.post('/api/reports/:id/analyze', async (c) => {
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
  const bestB64 = await b64Of(c.env, `${s0.report_id}/stills/${best.clip_id}_${best.object_id}`)
  const input = [{
    type: 'message',
    role: 'user',
    content: [
      {
        type: 'input_text',
        text:
          `You are the search coordinator for a lost ${s0.pet.species} named ${s0.pet.name}.\n` +
          `Owner description: ${s0.pet.description}\nOwner voice note: ${s0.transcript ?? 'n/a'}\n` +
          `Confirmed camera sightings:\n${JSON.stringify(sightings, null, 1)}\n\n` +
          'Decide what to do next using your tools: record a concrete next-search plan (suggest_next_search) ' +
          'and generate the shareable alert poster (make_poster). Then finish with a one-paragraph summary for the owner.',
      },
      { type: 'input_image', image_url: bestB64 },
    ],
  }]
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
        const r = await generatePoster(
          c.env,
          `${args.poster_prompt}. Bold headline text at top: '${args.headline_text}'. Clean lost-pet alert poster layout, high contrast, printable.`,
        )
        posterKey = `${s0.report_id}/poster.png`
        await c.env.MEDIA.put(posterKey, r.png, { httpMetadata: { contentType: 'image/png' } })
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
        const concept = s.pet.species === 'cat' ? 'cat' : 'dog'
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
          const tracks = await trackVideo(env, clip.media_url, concept, clip.fps)
          // SAM bills a 50-frame minimum per request (sam.ts samCost) — honor it in the meter.
          const framesBilled = Math.max(Math.round(clip.fps * clip.duration_s), 50)
          await setClip((cl) => {
            cl.tracks = tracks
            cl.n_tracks = tracks.length
            cl.status = 'done'
          })
          await updateState(env.DB, reportId, (st) => addCost(st, { sam_frames: framesBilled }))
        }
        msg.ack()
      } catch (e) {
        await setClip((cl) => {
          cl.status = 'error'
          cl.error = String(e).slice(0, 400)
        }).catch(() => {})
        msg.retry()
      }
    }
  },
}
