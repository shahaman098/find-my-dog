/** Voice-first narration: one ElevenLabs request per scene, with character timestamps -> word timings.
 *   ELEVENLABS_API_KEY=... [EL_SPEED=0.88 EL_SIMILARITY=0.9 EL_STYLE=0 EL_STABILITY=0.65] node production/voice.mjs production/scripts/film1.json [sceneId ...]
 * Writes production/out/voice/<film>/<scene>.wav + <scene>.words.json and a timing report.
 * The key is read from the environment only and never logged.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const KEY = process.env.ELEVENLABS_API_KEY
if (!KEY) { console.error('ELEVENLABS_API_KEY missing'); process.exit(2) }
const VOICE = 'dxT8yYZS41hHdsvjw7XV'
const MODEL = process.env.EL_MODEL ?? 'eleven_multilingual_v2'
// Tunable per run (EL_SPEED 0.7-1.2; lower = slower). Defaults are the settings the delivered films used.
const num = (k, d) => Number(process.env[k] ?? d)
const SETTINGS = { stability: num('EL_STABILITY', 0.65), similarity_boost: num('EL_SIMILARITY', 0.85), style: num('EL_STYLE', 0.15), use_speaker_boost: true, speed: num('EL_SPEED', 1.0) }
// Consistent pronunciation: spoken forms only; captions keep the written forms.
const SAY = [[/SAM 3\.1/g, 'SAM three point one'], [/\bD1\b/g, 'D one'], [/\bR2\b/g, 'R two'], [/\b403\b/g, 'four oh three'], [/Muse Spark/g, 'Muse Spark']]

const script = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const only = new Set(process.argv.slice(3))
const outDir = path.join('production', 'out', 'voice', script.film)
fs.mkdirSync(outDir, { recursive: true })

async function tts(text, prev, next, format) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=${format}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    // eleven_v3 rejects previous_text/next_text, so it gets each line on its own
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS, ...(MODEL === 'eleven_v3' ? {} : { previous_text: prev, next_text: next }) }),
  })
  if (!r.ok) throw Object.assign(new Error(`elevenlabs ${r.status}: ${(await r.text()).slice(0, 240)}`), { status: r.status })
  return r.json()
}

function spoken(text) { return SAY.reduce((s, [re, rep]) => s.replace(re, rep), text) }

/** Map character alignment of the *spoken* text back onto the *written* words for captions. */
function words(written, al) {
  const chars = al.characters, st = al.character_start_times_seconds, en = al.character_end_times_seconds
  const spokenWords = []
  let cur = null
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) { spokenWords.push(cur); cur = null } return }
    if (!cur) cur = { w: '', start: st[i], end: en[i] }
    cur.w += ch; cur.end = en[i]
  })
  if (cur) spokenWords.push(cur)
  // written tokens may expand when spoken (e.g. "3.1" -> "three point one"): distribute proportionally by spoken span
  const writtenTokens = written.split(/\s+/).filter(Boolean)
  const spokenTokens = spoken(written).split(/\s+/).filter(Boolean)
  const out = []
  let si = 0
  for (const wt of writtenTokens) {
    const n = spoken(wt).split(/\s+/).filter(Boolean).length || 1
    const group = spokenWords.slice(si, si + n)
    si += n
    if (group.length) out.push({ word: wt, start: +group[0].start.toFixed(3), end: +group[group.length - 1].end.toFixed(3) })
  }
  if (spokenWords.length !== spokenTokens.length) console.warn(`  note: ${spokenWords.length} aligned words vs ${spokenTokens.length} tokens`)
  return out
}

const report = []
let format = process.env.EL_FORMAT ?? 'pcm_48000'
for (let i = 0; i < script.scenes.length; i++) {
  const sc = script.scenes[i]
  if (only.size && !only.has(sc.id)) continue
  const prev = script.scenes[i - 1]?.text, next = script.scenes[i + 1]?.text
  let j
  try { j = await tts(spoken(sc.text), prev && spoken(prev), next && spoken(next), format) }
  catch (e) {
    if (format.startsWith('pcm') && (e.status === 403 || e.status === 400 || e.status === 422)) {
      console.warn(`  ${format} not allowed on this plan (${e.message.slice(0, 90)}); falling back to mp3_44100_128`)
      format = 'mp3_44100_128'
      j = await tts(spoken(sc.text), prev && spoken(prev), next && spoken(next), format)
    } else throw e
  }
  const raw = Buffer.from(j.audio_base64, 'base64')
  const wav = path.join(outDir, `${sc.id}.wav`)
  if (format.startsWith('pcm')) {
    const rate = format.split('_')[1]
    const tmp = wav + '.pcm'; fs.writeFileSync(tmp, raw)
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 's16le', '-ar', rate, '-ac', '1', '-i', tmp, '-ar', '48000', wav]); fs.unlinkSync(tmp)
  } else {
    const tmp = wav + '.mp3'; fs.writeFileSync(tmp, raw)
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-ar', '48000', '-ac', '1', wav]); fs.unlinkSync(tmp)
  }
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString())
  const ws = words(sc.text, j.alignment)
  fs.writeFileSync(path.join(outDir, `${sc.id}.words.json`), JSON.stringify({ scene: sc.id, text: sc.text, spoken: spoken(sc.text), duration: dur, format, model: MODEL, settings: SETTINGS, words: ws }, null, 1))
  const window = sc.end - sc.start
  const verdict = dur <= window - 0.3 ? 'fits' : 'OVERRUN'
  report.push({ scene: sc.id, window, duration: +dur.toFixed(2), slack: +(window - dur).toFixed(2), verdict })
  console.log(`${sc.id.padEnd(16)} ${dur.toFixed(2)}s / ${window}s  ${verdict}`)
}
fs.writeFileSync(path.join(outDir, 'timing_report.json'), JSON.stringify({ format, model: MODEL, settings: SETTINGS, report }, null, 1))
