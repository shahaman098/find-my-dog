/** Meta inference helpers for the Worker: SAM 3.1, Spark/Glimmer matching, ASR, Muse Image. */
import type { Env, Track } from './types'
import { parseSegmentation, mergeTracks } from './sam.ts'

export const BASE = 'https://api.meta.ai/v1'
const BASETEN_BASE = 'https://inference.baseten.co/v1'

function authHeaders(env: Env): Record<string, string> {
  return { Authorization: `Bearer ${env.META_API_KEY}`, 'Content-Type': 'application/json' }
}

/** Parse a model's JSON answer defensively: strip markdown fences, fail with a readable error. */
function parseModelJson(text: unknown, label: string): any {
  const raw = String(text ?? '').trim()
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(stripped)
  } catch {
    // last resort: first balanced {...} block
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try { return JSON.parse(stripped.slice(start, end + 1)) } catch { /* fall through */ }
    }
    throw new Error(`${label} returned invalid JSON: ${raw.slice(0, 120)}`)
  }
}

export type ContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }

/** Upload a clip to the Meta Files API; SAM can then read it by file_id. */
export async function uploadVideo(env: Env, bytes: ArrayBuffer, filename: string, contentType = 'video/mp4'): Promise<string> {
  const form = new FormData()
  form.append('purpose', 'user_data')
  form.append('file', new Blob([bytes], { type: contentType }), filename)
  const r = await fetch(`${BASE}/files`, { method: 'POST', headers: { Authorization: `Bearer ${env.META_API_KEY}` }, body: form })
  if (!r.ok) throw new Error(`files ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const j: any = await r.json()
  if (!j.id) throw new Error('files: no id returned')
  return j.id
}

/** A clip URL SAM cannot reach (local dev, private host) must be uploaded instead of passed by URL. */
export function isPublicUrl(u: string): boolean {
  try {
    const h = new URL(u).hostname
    return !(h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0' || h === '::1' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h))
  } catch {
    return false
  }
}

/** Stream SAM 3.1 over a video (public URL or uploaded file_id); return merged tracks. */
export async function trackVideo(env: Env, video: { url: string } | { fileId: string }, concept: string, fps: number): Promise<Track[]> {
  const input_video = 'url' in video ? { type: 'input_video', video_url: video.url } : { type: 'input_video', file_id: video.fileId }
  const resp = await fetch(`${BASE}/responses`, {
    method: 'POST',
    headers: authHeaders(env),
    body: JSON.stringify({
      model: 'sam-3.1',
      input: [{
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: concept },
          input_video,
        ],
      }],
      stream: true,
    }),
  })
  if (!resp.ok || !resp.body) throw new Error(`SAM ${resp.status}: ${(await resp.text()).slice(0, 300)}`)
  const text = await sseText(resp.body)
  return mergeTracks(parseSegmentation(text), fps)
}

async function sseText(body: ReadableStream<Uint8Array>): Promise<string> {
  let text = ''
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const events = buf.split('\n\n')
    buf = events.pop() ?? ''
    for (const evt of events) {
      for (const line of evt.split('\n')) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const j = JSON.parse(data) as { type: string; delta?: string }
          if (j.type === 'response.output_text.delta' && j.delta) text += j.delta
        } catch { /* partial line */ }
      }
    }
  }
  return text
}

/** Hosted Spark via the Responses API with structured output (input_text/input_image parts). */
export async function sparkStructured(
  env: Env,
  content: ContentPart[],
  schemaName: string,
  schema: object,
): Promise<{ parsed: any; usage: { input: number; output: number } }> {
  const resp = await fetch(`${BASE}/responses`, {
    method: 'POST',
    headers: authHeaders(env),
    body: JSON.stringify({
      model: env.SPARK_MODEL,
      input: [{ type: 'message', role: 'user', content }],
      text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
    }),
  })
  if (!resp.ok) throw new Error(`responses ${resp.status}: ${(await resp.text()).slice(0, 300)}`)
  const j: any = await resp.json()
  const usage = j.usage ?? {}
  return { parsed: parseModelJson(outputText(j), `${env.SPARK_MODEL} matcher`), usage: { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 } }
}

/** Raw /responses JSON has no output_text field — aggregate message content parts. */
function outputText(j: any): string {
  return (j.output ?? [])
    .filter((o: any) => o.type === 'message')
    .flatMap((o: any) => (o.content ?? []).map((c: any) => c.text ?? ''))
    .join('')
}

/** Open-weight Muse Glimmer on Baseten (OpenAI-compatible chat with image_url parts). */
export async function glimmerStructured(
  env: Env,
  parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>,
  schemaName: string,
  schema: object,
): Promise<{ parsed: any; usage: { input: number; output: number } }> {
  const resp = await fetch(`${BASETEN_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Api-Key ${env.BASETEN_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.GLIMMER_MODEL,
      messages: [{ role: 'user', content: parts }],
      response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
    }),
  })
  if (!resp.ok) throw new Error(`baseten ${resp.status}: ${(await resp.text()).slice(0, 300)}`)
  const j: any = await resp.json()
  const usage = j.usage ?? {}
  return { parsed: parseModelJson(j.choices?.[0]?.message?.content, `${env.GLIMMER_MODEL} matcher`), usage: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 } }
}

/** Responses-API tool loop against hosted Spark. handlers execute requested tools. */
export async function toolLoop(
  env: Env,
  input: any[],
  tools: object[],
  handlers: Record<string, (args: any) => Promise<string>>,
): Promise<{ summary: string; calls: string[] }> {
  let convo: any[] = input
  let summary = ''
  const callsMade: string[] = []
  for (let turn = 0; turn < 5; turn++) {
    const resp = await fetch(`${BASE}/responses`, {
      method: 'POST',
      headers: authHeaders(env),
      body: JSON.stringify({ model: env.SPARK_MODEL, input: convo, tools }),
    })
    if (!resp.ok) throw new Error(`responses ${resp.status}: ${(await resp.text()).slice(0, 300)}`)
    const j: any = await resp.json()
    const out: any[] = j.output ?? []
    const calls = out.filter((o) => o.type === 'function_call')
    summary = out.filter((o) => o.type === 'message').map((o) => (o.content ?? []).map((c: any) => c.text ?? '').join('')).join('') || summary
    if (calls.length === 0) return { summary, calls: callsMade }
    convo = [...convo, ...out]
    for (const call of calls) {
      let args: any = {}
      try {
        args = parseModelJson(call.arguments || '{}', `${call.name} arguments`)
      } catch (e: any) {
        // Bad tool arguments are recoverable: feed the error back and let the model retry.
        convo.push({ type: 'function_call_output', call_id: call.call_id, output: `tool failed: ${String(e?.message ?? e).slice(0, 200)}` })
        continue
      }
      callsMade.push(call.name)
      let output = 'ok'
      try {
        output = handlers[call.name] ? await handlers[call.name](args) : 'unknown tool'
      } catch (e: any) {
        output = `tool failed: ${String(e).slice(0, 200)}`
      }
      convo.push({ type: 'function_call_output', call_id: call.call_id, output })
    }
  }
  return { summary, calls: callsMade }
}

/** ASR: multipart `request` settings part + WAV `audio` part (client encodes WAV). */
export async function transcribe(env: Env, wav: ArrayBuffer): Promise<{ transcript: string; seconds: number }> {
  const form = new FormData()
  form.append('request', new Blob([JSON.stringify({ mode: 'DIARIZATION', model: 'muse-voice-transcribe-1.0', audioEncoding: 'WAV' })], { type: 'application/json' }), 'request.json')
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'audio.wav')
  const resp = await fetch(`${BASE}/asr/transcribe`, { method: 'POST', headers: { Authorization: `Bearer ${env.META_API_KEY}` }, body: form })
  if (!resp.ok) throw new Error(`asr ${resp.status}: ${(await resp.text()).slice(0, 300)}`)
  const j: any = await resp.json()
  return { transcript: (j.transcript ?? '').trim(), seconds: (j.audioDurationMs ?? 0) / 1000 }
}

/** Muse Image returns WebP today; sniff the bytes so the poster is stored and served as what it is. */
export function imageType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp'
  return 'application/octet-stream'
}

/** Muse Image poster generation -> image bytes + their real content type. */
export async function generatePoster(env: Env, prompt: string): Promise<{ png: ArrayBuffer; contentType: string }> {
  const resp = await fetch(`${BASE}/images/generations`, {
    method: 'POST',
    headers: authHeaders(env),
    body: JSON.stringify({ model: 'muse-image-1.0', prompt, size: '1024x1536' }),
  })
  if (!resp.ok) throw new Error(`image ${resp.status}: ${(await resp.text()).slice(0, 300)}`)
  const j: any = await resp.json()
  const b64: string | undefined = j.data?.[0]?.b64_json
  if (!b64) throw new Error('no image returned')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { png: bytes.buffer, contentType: imageType(bytes) }
}
