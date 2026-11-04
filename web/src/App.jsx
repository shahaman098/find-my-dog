import React, { useEffect, useRef, useState } from 'react'
import { blobToWavBlob } from './wav.js'
import { probeVideo, extractStill } from './probe.js'

/** Owner token: issued once when the report is filed, kept on this device, sent on owner-only calls. */
const tokenKey = id => `fmd_owner_${id}`
const getToken = id => { try { return localStorage.getItem(tokenKey(id)) } catch { return null } }
const setToken = (id, t) => { try { localStorage.setItem(tokenKey(id), t) } catch { /* private mode: token lives for this tab only */ } memTokens[id] = t }
const memTokens = {}
const ownerToken = id => getToken(id) ?? memTokens[id] ?? null
const ownerHeaders = id => { const t = ownerToken(id); return t ? { 'X-Owner-Token': t } : {} }

const MAX_UPLOAD_MB = 100

const api = (path, opts = {}) => {
  const id = path.match(/^\/reports\/(\w+)/)?.[1]
  const headers = { ...(id ? ownerHeaders(id) : {}), ...(opts.headers || {}) }
  return fetch(`/api${path}`, { ...opts, headers }).then(async r => {
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      let msg = ''
      try { msg = JSON.parse(text).error } catch { msg = text.slice(0, 200) }
      const e = new Error(msg || `HTTP ${r.status}`)
      e.status = r.status
      throw e
    }
    return r.json()
  })
}

/** Downscale the owner's photo to a ≤1600px JPEG: faster upload, fewer model tokens, PNG/WebP normalised.
 * Falls back to the original file if the browser can't decode it. */
async function normalisePhoto(file) {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9))
    return blob ? new File([blob], 'pet_photo.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

function CopyLink({ href, label, title }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    const url = new URL(href, location.href).toString()
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    catch { prompt('Copy this link:', url) }
  }
  return <button type="button" className="pill" onClick={copy} title={title}>{copied ? '✓ Copied' : label}</button>
}

function useHashRoute() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const fn = () => setHash(location.hash)
    addEventListener('hashchange', fn)
    return () => removeEventListener('hashchange', fn)
  }, [])
  return hash
}

/** Uploaded files live only in this session's memory; stills they produce persist in R2. */
const fileCache = {}

function Recorder({ onDone, onError, ready }) {
  const [rec, setRec] = useState(null)
  const [recording, setRecording] = useState(false)
  const chunks = useRef([])
  const streamRef = useRef(null)
  const stopTracks = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }
  useEffect(() => stopTracks, []) // release the mic if the tab navigates mid-recording
  async function start() {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      onError?.('Microphone unavailable — check permission, or just type the description.')
      return
    }
    const r = new MediaRecorder(streamRef.current)
    chunks.current = []
    r.ondataavailable = e => chunks.current.push(e.data)
    r.onstop = () => { stopTracks(); onDone(new Blob(chunks.current)) }
    r.start()
    setRec(r)
    setRecording(true)
  }
  return (
    <button type="button" className={recording ? 'tog recording' : ready ? 'tog on' : 'tog'} aria-pressed={recording}
      onClick={() => (recording ? (rec.stop(), setRecording(false)) : start())}>
      <Icon name="mic" size={14} /> {recording ? 'Stop recording' : ready ? 'Voice note ✓' : 'Voice note'}
    </button>
  )
}

/** Line icons (stroke = currentColor) so pills read cleanly in light and dark. */
const ICONS = {
  play: <path d="M8 5.5v13l10-6.5z" />,
  shield: <><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  github: <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />,
  camera: <><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  doc: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 10h6M9 14h6M9 18h4" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.8.8 3 2.6 3.5 5.2" /></>,
  route: <><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  sparkle: <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l3 3" /></>,
}
function Icon({ name, size = 16 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
  )
}

const REPO = 'https://github.com/shahaman098/find-my-dog'

/** In-page anchor that survives hash routing: scroll if the section is here, else go to the landing page. */
function scrollToHow(e) {
  e.preventDefault()
  const el = document.getElementById('how')
  if (el) el.scrollIntoView({ behavior: 'smooth' })
  else { try { sessionStorage.setItem('fmd_scroll', 'how') } catch { /* ignore */ } location.hash = '#/' }
}

/** SAM-style track colours: each tracked animal keeps one vivid colour, as in SAM's own mask overlays. */
const TRACK_COLORS = ['#ff3d7f', '#00b8f0', '#f5b400', '#8b5cf6', '#00c98a', '#ff6a00', '#e94dd0', '#2f7cf6']
const trackColor = (id) => TRACK_COLORS[Math.abs(Number(id) || 0) % TRACK_COLORS.length]

/** Filled paw print, used for the logo, buttons and the decorative trails. */
function PawMark({ size = 16, className = 'paw' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g fill="currentColor"><ellipse cx="6" cy="9.5" rx="2" ry="2.6" /><ellipse cx="10" cy="5.8" rx="2" ry="2.6" /><ellipse cx="14.5" cy="5.8" rx="2" ry="2.6" /><ellipse cx="18.5" cy="9.5" rx="2" ry="2.6" /><path d="M12.2 11.2c-3 0-6.2 3.6-6.2 6.3 0 1.9 1.5 2.6 3 2.6 1.3 0 2.2-.6 3.2-.6s1.9.6 3.2.6c1.5 0 3-.7 3-2.6 0-2.7-3.2-6.3-6.2-6.3z" /></g>
    </svg>
  )
}

function Brand() {
  return (
    <a className="brand" href="#/" aria-label="findmydog home">
      <span className="mark"><PawMark size={18} /></span>
      <span>findmy<em>dog</em></span>
    </a>
  )
}

function Nav() {
  return (
    <nav className="nav">
      <Brand />
      <span className="spacer" />
      <a className="navlink" href="#how" onClick={scrollToHow}>How it works</a>
      <a className="navlink" href={REPO} target="_blank" rel="noreferrer"><Icon name="github" /> GitHub</a>
      <a className="navBtn" href="#/demo"><Icon name="play" size={14} /> Live demo</a>
    </nav>
  )
}

/** A trail of paw prints walking across a section (deterministic: no layout shift between renders). */
function PawTrail({ steps = 9, className = 'pawTrail' }) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: steps }, (_, i) => (
        <span key={i} style={{ left: `${(i / (steps - 1)) * 100}%`, top: `${50 + Math.sin(i * 0.9) * 26 + (i % 2 ? 9 : -9)}%`, animationDelay: `${i * 0.35}s` }}>
          <PawMark size={18} />
        </span>
      ))}
    </div>
  )
}

function HowItWorks() {
  return (
    <section id="how" className="bleed dark band">
      <div className="bandInner">
        <p className="eyebrow"><PawMark size={13} /> HOW IT WORKS</p>
        <h2 className="bandTitle">Every camera on your street<br />joins the search party</h2>
        <p className="bandSub">No new hardware and no walled garden. Neighbours share whatever their cameras caught; Meta's models do the watching, and you stay in control of every decision.</p>
        <a className="cta" href="#/demo"><Icon name="play" /> Watch the live demo</a>
        <ol className="bandGrid">
          <li className="bandCard"><span className="stepNo">1</span><Icon name="doc" size={22} /><b>File the report</b><span>A photo, a description and a voice note. Muse Voice Transcribe turns thirty panicked seconds into a search brief.</span></li>
          <li className="bandCard"><span className="stepNo">2</span><Icon name="video" size={22} /><b>SAM 3.1 watches every clip</b><span>Doorbell cams, home cams, dashcams. Every animal gets a persistent identity, even through occlusions.</span><span className="samChips" aria-hidden="true">{[0, 1, 2, 3].map(i => <i key={i} style={{ '--trk': trackColor(i) }}>#{i}</i>)}</span></li>
          <li className="bandCard"><span className="stepNo">3</span><Icon name="eye" size={22} /><b>Muse Spark finds yours</b><span>Appearance-only matching with a written rationale. Nothing counts as a sighting until you confirm it.</span></li>
          <li className="bandCard"><span className="stepNo">4</span><Icon name="route" size={22} /><b>A plan for first light</b><span>Spark's tool loop turns confirmed sightings into a timeline, a next-search plan and a Muse Image poster.</span></li>
        </ol>
        <p className="models">SAM 3.1 · Muse Spark 1.3 · Muse Voice Transcribe · Muse Image</p>
      </div>
    </section>
  )
}

/** Measured on real footage with the production code path — see eval/results and the README. */
const PROOF = [
  { n: '9 / 9', l: 'times the true pet was the top-ranked candidate', s: 'Muse Spark · 3 dogs × 3 trials vs look-alike distractors' },
  { n: '92%', l: 'match accuracy across 87 comparisons', s: '93% recall · 83% precision before owner confirmation' },
  { n: '1 ID', l: 'kept through a 1.5 s full-frame blackout', s: 'SAM 3.1 on real doorbell footage, dog ≈ 50 × 50 px' },
  { n: '0', l: 'people ever confirmed as a pet', s: 'a person SAM mislabelled "dog" was rejected in 9 / 9 checks' },
]

const VERSUS = [
  ['Cameras', 'Scans Ring outdoor cameras', 'Any clip anyone shares: doorbell, CCTV, dashcam, phone'],
  ['Pets', 'Dogs', 'Dogs, cats, any animal with a photo'],
  ['Consent', 'Default-on scanning', 'Opt-in, owner-initiated, scoped to one search'],
  ['What you get', 'A "possible match" alert', 'Ranked evidence with reasons, a timeline, a dawn search plan and a poster'],
  ['Trust', 'Closed source', 'Open source, with the benchmark in the repo'],
]

function ProofAndVersus() {
  return (
    <section className="versus">
      <p className="eyebrow light"><PawMark size={13} /> MEASURED ON REAL FOOTAGE</p>
      <div className="proofGrid">
        {PROOF.map(p => <div key={p.l} className="proof"><b>{p.n}</b><span>{p.l}</span><small>{p.s}</small></div>)}
      </div>
      <h2 className="versusTitle">Ring proved the need. We built the open version.</h2>
      <div className="vsTable" role="table" aria-label="Ring Search Party compared with Find My Dog">
        <div className="vsRow vsHead" role="row"><span role="columnheader" /><span role="columnheader">Ring Search Party</span><span role="columnheader">Find My Dog</span></div>
        {VERSUS.map(([k, a, b]) => (
          <div key={k} className="vsRow" role="row"><span role="rowheader">{k}</span><span role="cell">{a}</span><span role="cell" className="us">{b}</span></div>
        ))}
      </div>
      <p className="sub small vsNote">Ring figures from Amazon's own announcements; ours from <a href={`${REPO}#real-model-results`} target="_blank" rel="noreferrer">the benchmark in the repo</a>.</p>
    </section>
  )
}

function ClosingFooter() {
  return (
    <section className="bleed dark closing">
      <PawTrail steps={11} className="pawTrail closingTrail" />
      <div className="closingInner">
        <h2 className="closingTitle">Bring the whole street into the search</h2>
        <p className="bandSub">Opt-in footage only, scoped to one search, withdrawn clips deleted, and no person or face identification anywhere in the pipeline. Open source, so you can check every one of those claims.</p>
        <div className="ctaGrid">
          <a className="cta" href={REPO} target="_blank" rel="noreferrer"><Icon name="github" /> View on GitHub</a>
          <a className="ghost" href="#/demo"><Icon name="play" /> Live demo</a>
          <a className="ghost" href="#how" onClick={scrollToHow}><Icon name="route" /> How it works</a>
          <a className="ghost" href={`${REPO}#privacy-stance`} target="_blank" rel="noreferrer"><Icon name="shield" /> Privacy stance</a>
        </div>
      </div>
      <footer className="footRow">
        <span className="footLeft"><Icon name="user" /> Aman Kumar Sah</span>
        <span className="footMid">Open source · Built for the Meta Global AI Developer Hackathon 2026</span>
        <span className="footRight"><a href="#/demo">Demo</a><span aria-hidden="true">·</span><a href={REPO} target="_blank" rel="noreferrer">Source</a></span>
      </footer>
    </section>
  )
}

/** #/demo — jumps to the pre-seeded demo report's share page (no setup, works logged out). */
function DemoLanding() {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    api('/demo')
      .then(d => { if (d?.id) location.hash = `#/r/${d.id}/share`; else setFailed(true) })
      .catch(() => setFailed(true))
  }, [])
  if (failed) {
    return (
      <div>
        <Nav />
        <div className="card center">
          <h2>Demo is warming up</h2>
          <p className="sub">The seeded demo report isn't ready yet, but the real thing is one form away.</p>
          <a className="btn primary" href="#/">Start a report</a>
        </div>
      </div>
    )
  }
  return <div className="card center">Loading demo…</div>
}

function NewReport({ go }) {
  const [form, setForm] = useState({ pet_name: '', species: 'dog', description: '' })
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState('')
  useEffect(() => {
    if (!photo) { setPreview(''); return }
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  const [voice, setVoice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    try {
      if (sessionStorage.getItem('fmd_scroll') === 'how') {
        sessionStorage.removeItem('fmd_scroll')
        requestAnimationFrame(() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }))
      }
    } catch { /* storage blocked: stay at top */ }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.set('pet_name', form.pet_name)
      fd.set('species', form.species)
      fd.set('description', form.description)
      if (photo) fd.set('photo', await normalisePhoto(photo))
      if (voice) fd.set('voice_note', await blobToWavBlob(voice), 'voice.wav')
      const r = await api('/reports', { method: 'POST', body: fd })
      if (r.owner_token) setToken(r.report_id, r.owner_token)
      go(`#/r/${r.report_id}`)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const SPECIES = [['dog', 'Dog'], ['cat', 'Cat'], ['other', 'Other']]
  return (
    <div>
      <Nav />
      <div className="hero">
        <div className="heroCopy">
          <p className="kicker"><PawMark size={14} /> A search party for lost pets</p>
          <h1 className="heroTitle">Lost your pet?<br /><span className="hl">Your street already saw them.</span></h1>
          <p className="heroLead">Neighbours share clips from any doorbell, CCTV or dashcam. <b>SAM 3.1</b> follows every animal in the footage, <b>Muse Spark</b> picks out yours, and you get a timeline of sightings, a plan for where to look next, and a poster for the street.</p>
          <ul className="tags">
            <li className="tag"><Icon name="shield" size={15} /> Opt-in footage only</li>
            <li className="tag"><Icon name="eye" size={15} /> Animals only, never faces</li>
            <li className="tag"><Icon name="github" size={15} /> Open source</li>
          </ul>
          <PawTrail steps={6} className="pawTrail heroTrail" />
        </div>
        <form className="inputCard missing" onSubmit={submit}>
          <span className="tape left" aria-hidden="true" /><span className="tape right" aria-hidden="true" />
          <div className="posterHead"><b>MISSING</b><span>Help bring them home</span></div>
          <div className="posterBody">
            <label className={preview ? 'photoSlot filelabel filled' : 'photoSlot filelabel'}>
              {preview
                ? <img src={preview} alt="Your pet's photo" />
                : <><Icon name="camera" size={30} /><b>Add a clear photo</b><small>Face and coat visible works best</small></>}
              <input required type="file" accept="image/*" onChange={e => setPhoto(e.target.files[0])} />
            </label>
            <div className="posterFields">
              <input required type="text" className="nameField" placeholder="Your pet's name" value={form.pet_name}
                onChange={e => setForm({ ...form, pet_name: e.target.value })} />
              <div className="speciesRow" role="radiogroup" aria-label="Species">
                {SPECIES.map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={form.species === v}
                    className={form.species === v ? 'tog on' : 'tog'} onClick={() => setForm({ ...form, species: v })}>{l}</button>
                ))}
              </div>
              <textarea placeholder="Describe them: coat, markings, collar, size…" value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })} />
              <Recorder onDone={setVoice} onError={setErr} ready={!!voice} />
            </div>
          </div>
          <button className="sendBtn" disabled={busy}>{busy ? <><span className="spinner" /> Starting the search…</> : <><PawMark size={18} /> Start the search</>}</button>
          {err && <p className="err" role="alert">{err}</p>}
          <nav className="tearTabs" aria-label="Quick links">
            <a href="#/demo"><Icon name="play" size={14} /> Live demo</a>
            <a href="#how" onClick={scrollToHow}><Icon name="route" size={14} /> How it works</a>
            <a href={REPO} target="_blank" rel="noreferrer"><Icon name="github" size={14} /> Source code</a>
          </nav>
        </form>
      </div>
      <HowItWorks />
      <ProofAndVersus />
      <ClosingFooter />
    </div>
  )
}

/** Still-cutting works in any session: prefer the in-memory file, else fetch the clip media (it's stored in R2). */
async function mediaFor(clip) {
  return fileCache[clip.clip_id] ?? fetch(clip.media_url).then(r => {
    if (!r.ok) throw new Error(`media ${r.status}`)
    return r.blob()
  })
}

async function extractStillsFor(report, clip, file) {
  if (!file) return false
  let ok = 0
  for (const t of clip.tracks || []) {
    if (t.n_frames === 0) continue
    try {
      const best = t.detections.reduce((a, b) => ((b.confidence ?? 0) > (a.confidence ?? 0) ? b : a))
      const blob = await extractStill(file, best.t, best.box)
      const resp = await fetch(`/api/reports/${report.report_id}/stills/${clip.clip_id}/${t.object_id}`, { method: 'PUT', body: blob, headers: ownerHeaders(report.report_id) })
      if (resp.ok) ok++
    } catch (e) { console.warn('still extract failed', e) }
  }
  if (ok > 0) {
    await api(`/reports/${report.report_id}/clips/${clip.clip_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ still_done: true }) })
  }
  return ok > 0
}

/** Spark's score is confidence in its *verdict*, and an unusable crop (no animal) is "no match, low confidence".
 * So only a positive verdict carries match strength; ranking by it is what eval/benchmark.ts measured (9/9 top-1). */
const matchStrength = m => (m.is_match ? m.score : 0)
const verdictText = m => m.is_match
  ? `${Math.round(m.score * 100)}% match`
  : m.score >= 0.5 ? `not a match · Spark ${Math.round(m.score * 100)}% sure` : 'not a match · unclear or unusable crop'

function ClipCard({ report, clip, onRefresh, canEdit }) {
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(() => new Set())
  useEffect(() => {
    let stale = false
    if (canEdit && clip.status === 'done' && !clip.still_done) {
      setBusy(true)
      mediaFor(clip)
        .then(file => extractStillsFor(report, clip, file))
        .then(ok => { if (!stale && ok) onRefresh() })
        .catch(e => console.warn('still extraction skipped', e))
        .finally(() => { if (!stale) setBusy(false) })
    }
    return () => { stale = true }
  }, [clip.status, clip.still_done])
  useEffect(() => { if (clip.still_done) setMissing(new Set()) }, [clip.still_done])
  const still = id => `/api/reports/${report.report_id}/stills/${clip.clip_id}/${id}`
  const statusChip = { queued: '⏳ queued', uploading: '⬆️', tracking: '👁 SAM 3.1 tracking…', extracting: '✂️', done: '✅ done', error: '❌' }[clip.status] || clip.status
  async function reclock(e) {
    if (!canEdit) return
    const clock = prompt('When was this recorded? (e.g. 7:42 PM)', clip.captured_clock)
    if (clock === null) return
    await api(`/reports/${report.report_id}/clips/${clip.clip_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ captured_clock: clock }) })
    onRefresh()
  }
  return (
    <div className="card">
      <div className="row">
        <b>{clip.label}</b>
        <button className="chip chipbtn" onClick={reclock} disabled={!canEdit} title={canEdit ? 'Set recording time' : 'Recording time'}>🕐 {clip.captured_clock || 'set time'}</button>
        <span className={`chip st-${clip.status}`}>{statusChip}</span>
        <span className="chip">{clip.n_tracks || 0} animals</span>
        <span className="chip">{(clip.duration_s || 0).toFixed(0)}s</span>
      </div>
      {clip.status === 'error' && <p className="err">{clip.error}</p>}
      {clip.status === 'queued' && clip.error && <p className="sub small">↻ Retrying shortly…</p>}
      {clip.status === 'done' && (
        <div className="gallery">
          {(clip.tracks || []).map(t => (
            <div key={t.object_id} className="still trk" style={{ '--trk': trackColor(t.object_id) }}>
              {missing.has(t.object_id)
                ? <div className="stillMissing">{busy ? 'cutting stills…' : 'still unavailable'}</div>
                : <img src={still(t.object_id)} alt={`track ${t.object_id}`} onError={() => setMissing(prev => new Set(prev).add(t.object_id))} />}
              <span><b className="trkId">track #{t.object_id}</b> {t.first_seen.toFixed(0)}s–{t.last_seen.toFixed(0)}s · {t.n_frames}f</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Ribbon({ sightings, petName }) {
  // time-of-day ribbon: pins positioned by clock string if parseable, else spread evenly
  const toMin = (clock) => {
    const m = String(clock).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
    if (!m) return null
    let h = +m[1] % 24
    if (m[3] && /pm/i.test(m[3]) && h < 12) h += 12
    if (m[3] && /am/i.test(m[3]) && h === 12) h = 0
    return h * 60 + +m[2]
  }
  const mins = sightings.map(s => toMin(s.clock))
  const usable = mins.filter(v => v !== null)
  const lo = usable.length ? Math.min(...usable) - 20 : 0
  const hi = usable.length ? Math.max(...usable) + 20 : 60
  const pos = i => {
    if (mins[i] !== null) return ((mins[i] - lo) / Math.max(hi - lo, 1)) * 100
    return ((i + 1) / (sightings.length + 1)) * 100
  }
  return (
    <div className="ribbon">
      <div className="ribbonBar" />
      {sightings.map((s, i) => (
        <div key={`${s.clip_id}:${s.object_id}`} className="pin" style={{ left: `${pos(i)}%` }}>
          <img src={s.still} alt="sighting" />
          <div className="pinLabel"><b>{s.clock || 'time unknown'}</b><br />{s.place}</div>
        </div>
      ))}
      <div className="ribbonCaption">🐾 confirmed sightings of {petName} — {sightings.length} camera{ sightings.length > 1 ? 's' : '' }</div>
    </div>
  )
}

function ShareView({ id, r }) {
  const [tl, setTl] = useState(null)
  const [tlErr, setTlErr] = useState('')
  const load = () => {
    setTlErr(''); setTl(null)
    api(`/reports/${id}/timeline`).then(setTl).catch(e => setTlErr(e.message))
  }
  useEffect(load, [id])
  const sightings = tl?.sightings ?? []
  return (
    <div className="card center">
      <h2><PawMark size={26} /> Sightings of {r.pet.name}</h2>
      <p className="sub">Owner-initiated search · opt-in footage only · no person identification</p>
      {tlErr && <p className="err">Couldn't load the timeline: {tlErr} <button className="btn" onClick={load}>Retry</button></p>}
      {tl && sightings.length > 0 && <Ribbon sightings={sightings} petName={r.pet.name} />}
      {!tl && !tlErr && <p className="sub">Loading…</p>}
      {tl && sightings.length === 0 && <p className="sub">No confirmed sightings yet.</p>}
      {tl?.next_search && (
        <div className="plan">
          <h3>➡️ {tl.next_search.headline}</h3>
          <p><b>Window:</b> {tl.next_search.window} · <b>Area:</b> {tl.next_search.area}</p>
          <p>{tl.next_search.why}</p>
          <ul>{(tl.next_search.steps || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {tl?.summary && <p className="sub">{tl.summary}</p>}
      <div className="shareMedia">
        <figure className="realPhoto">
          <img src={`/api/reports/${id}/pet_photo`} alt={`${r.pet.name}, the owner's photo`} />
          <figcaption>This is {r.pet.name} — the owner's own photo</figcaption>
        </figure>
        {tl?.poster && <img className="poster" src={tl.poster} alt="alert poster" />}
      </div>
      {tl?.cost && (
        <p className="sub small costline">
          This search: ${tl.cost.usd?.toFixed(2)} — SAM {tl.cost.sam_frames?.toLocaleString()} video frames ·
          Spark {(tl.cost.spark_in / 1000).toFixed(1)}k in / {(tl.cost.spark_out / 1000).toFixed(1)}k out tokens
          {tl.cost.asr_seconds > 0 && <> · {Math.round(tl.cost.asr_seconds)}s transcribed</>}
        </p>
      )}
    </div>
  )
}

function NeighborGive({ id }) {
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [clock, setClock] = useState('')
  useEffect(() => { api(`/reports/${id}`).then(setR).catch(e => setErr(e.message)) }, [id])
  async function upload(e) {
    e.preventDefault()
    const file = e.target.file.files[0]
    if (!file) return
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) { setErr(`That clip is over ${MAX_UPLOAD_MB} MB — trim it to the moments around the sighting and try again.`); return }
    setErr('')
    try {
      const probe = await probeVideo(file).catch(() => ({ fps: 30, duration: 0 }))
      const fd = new FormData()
      fd.set('file', file)
      fd.set('label', e.target.label.value || 'Neighbor cam')
      fd.set('captured_clock', clock)
      fd.set('fps', String(probe.fps))
      fd.set('duration', String(probe.duration))
      const clip = await api(`/reports/${id}/clips`, { method: 'POST', body: fd })
      if (clip?.clip_id) fileCache[clip.clip_id] = file // cut stills here if this tab stays open; the owner's console cuts them otherwise
      setDone(true)
    } catch (e2) { setErr(e2.message) }
  }
  if (err && !r) return <div className="card center"><p className="err">{err}</p></div>
  if (!r) return <div className="card center">Loading…</div>
  return (
    <div>
      <Nav />
      <div className="card center">
        <p className="kicker"><PawMark size={14} /> A neighbour needs your help</p>
        <h1>Help find {r.pet.name}</h1>
        {err && <p className="err" role="alert">{err}</p>}
        <p className="sub">A neighbor is searching for their lost {r.pet.species}. If your camera might have caught them, share the clip — it stays within this search only.</p>
        {done ? (
          <p className="ok">✅ Thank you! Your clip is being searched now.</p>
        ) : (
          <form onSubmit={upload}>
            <input name="label" placeholder="Where is this camera? (e.g. Front door, Driveway)" />
            <input name="clock" type="time" value={clock} onChange={e => setClock(e.target.value)} title="Roughly when was this recorded?" />
            <label className="filelabel pill" style={{ justifyContent: 'center' }}>🎥 Choose the clip
              <input name="file" type="file" accept="video/*" required />
            </label>
            <button className="btn primary">Share clip with the search</button>
          </form>
        )}
        <p className="sub small">Opt-in only · used for this search only · withdraw any time · animals matched by appearance, never people.</p>
      </div>
    </div>
  )
}

function ReportView({ id, share }) {
  const canEdit = !!ownerToken(id)
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  const [connLost, setConnLost] = useState(false)
  const [busy, setBusy] = useState('')
  const refresh = () => api(`/reports/${id}`).then(data => { setR(data); setConnLost(false) }).catch(e => {
    if (e.status === 404) setErr(e.message) // really gone
    else if (!r) setErr(e.message) // first load failed — nothing to show
    else setConnLost(true) // transient poll blip: keep the last good state on screen
  })
  useEffect(() => { refresh() }, [id])
  useEffect(() => {
    if (!r || share) return
    const pending = r.clips?.some(c => ['queued', 'uploading', 'tracking', 'extracting'].includes(c.status))
    if (pending) { const t = setTimeout(refresh, 2500); return () => clearTimeout(t) }
  }, [r])

  if (err && !r) return <div className="card center"><p className="err">{err}</p><a className="btn" href="#/">Start a report</a></div>
  if (!r) return <div className="card center">Loading…</div>

  async function addClips(e) {
    for (const f of [...e.target.files]) {
      if (f.size > MAX_UPLOAD_MB * 1024 * 1024) { setErr(`${f.name} is over ${MAX_UPLOAD_MB} MB — trim it and add it again.`); continue }
      const probe = await probeVideo(f).catch(() => ({ fps: 30, duration: 0 }))
      const clipIdHint = f.name
      const fd = new FormData()
      fd.set('file', f)
      fd.set('label', clipIdHint.replace(/\.[^.]+$/, ''))
      fd.set('captured_clock', '')
      fd.set('fps', String(probe.fps))
      fd.set('duration', String(probe.duration))
      try {
        const clip = await api(`/reports/${id}/clips`, { method: 'POST', body: fd })
        fileCache[clip.clip_id] = f
      } catch (e2) { setErr(e2.message) }
    }
    e.target.value = ''
    refresh()
  }
  async function runMatch() {
    setBusy('match')
    try { await api(`/reports/${id}/match`, { method: 'POST' }); await refresh() }
    catch (e) { setErr(e.message) } finally { setBusy('') }
  }
  async function confirm(m, v) {
    await api(`/reports/${id}/matches/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clip_id: m.clip_id, object_id: m.object_id, confirmed: v }) })
    refresh()
  }
  async function analyze() {
    setBusy('analyze')
    try { await api(`/reports/${id}/analyze`, { method: 'POST' }); await refresh() }
    catch (e) { setErr(e.message) } finally { setBusy('') }
  }

  const sightings = (r.matches || []).filter(m => m.confirmed === true)

  return (
    <div>
      <Nav />
      <header className="topbar">
        <b style={{ fontSize: 17 }}>Searching for {r.pet.name}</b>
        <span className="chip">{r.pet.species}</span>
        {r.transcript && <span className="chip">🎙 transcribed</span>}
        {r.transcript_error && <span className="chip" title={r.transcript_error}>🎙 unavailable</span>}
        {connLost && <span className="chip">⚠ reconnecting…</span>}
        <span className="chip">search cost ${r.cost?.usd?.toFixed?.(2) ?? '0.00'}</span>
        <span className="spacer" />
        {share
          ? (canEdit && <a className="pill" href={`#/r/${id}`}><Icon name="route" /> Search console</a>)
          : sightings.length > 0 && <a className="pill" href={`#/r/${id}/share`}><Icon name="link" /> Share page</a>}
        {!r.demo && <CopyLink href={`#/r/${id}/give`} label={<><Icon name="users" /> Copy neighbor link</>} title="Neighbors open this to add their camera clips" />}
        {canEdit && !share && <CopyLink href={`#/r/${id}/k/${ownerToken(id)}`} label={<><Icon name="key" /> Owner link</>} title="Private: opens this search with owner controls on another device" />}
      </header>
      {!share && !canEdit && (
        <p className="banner" role="status">
          {r.demo
            ? <>👀 You're viewing the seeded demo search (read-only, real model output). <a href="#/">Start your own report</a> to run the full pipeline.</>
            : <>👀 View only. Matching and confirmations happen on the owner's device.</>}
        </p>
      )}

      {share ? <ShareView id={id} r={r} /> : (
        <>
          <section className="card">
            <div className="row"><b>1 · Neighborhood footage</b><span className="spacer" />
              {!r.demo && (
                <label className="btn filelabel">+ Add clips
                  <input type="file" accept="video/*" multiple onChange={addClips} />
                </label>
              )}
            </div>
            <p className="sub">Doorbell cams, home cams, dashcams — anything a neighbor will share. Set each clip's recording time for the timeline.</p>
            {(r.clips || []).map(c => <ClipCard key={c.clip_id} report={r} clip={c} onRefresh={refresh} canEdit={canEdit} />)}
            {(r.clips || []).length === 0 && <p className="sub empty">🎥 No clips yet — add the first one above.</p>}
          </section>

          <section className="card">
            <div className="row"><b>2 · Is one of them {r.pet.name}?</b><span className="spacer" />
              <button className="btn primary" disabled={!canEdit || busy === 'match' || !(r.clips || []).some(c => c.status === 'done')} onClick={runMatch}>
                {busy === 'match' && <span className="spinner" />}
                {busy === 'match' ? 'Matching…' : `Run matcher${r.matcher_model && r.matcher_model !== 'mock' ? ` (${r.matcher_model.split(':')[0]})` : ''}`}
              </button>
            </div>
            <div className="row ownerRef">
              <img className="ownerThumb" src={`/api/reports/${id}/pet_photo`} alt={`reference photo of ${r.pet.name}`} />
              <span className="sub">Reference photo — every tracked animal is compared against this, by appearance only.</span>
            </div>
            {(r.matches || []).length === 0 && <p className="sub">Run the matcher after clips finish processing.</p>}
            {[...(r.matches || [])].sort((a, b) => matchStrength(b) - matchStrength(a)).map(m => {
              const clip = r.clips.find(c => c.clip_id === m.clip_id)
              const pct = Math.round(matchStrength(m) * 100)
              return (
                <div key={`${m.clip_id}:${m.object_id}`} className="sighting trk" style={{ '--trk': trackColor(m.object_id) }}>
                  <div className="trkFrame"><img src={`/api/reports/${id}/stills/${m.clip_id}/${m.object_id}`} alt={`track ${m.object_id}`} /><b className="trkId">track #{m.object_id}</b></div>
                  <div>
                    <b>{clip?.label}</b> · {verdictText(m)}
                    {m.is_match && <div className="scorebar" role="img" aria-label={`match strength ${pct} percent`}><i style={{ width: `${pct}%` }} /></div>}
                    <p className="sub">{m.rationale}</p>
                    {canEdit && m.confirmed === null && (
                      <div className="row">
                        <button className={m.is_match ? 'btn primary' : 'btn'} onClick={() => confirm(m, true)}>✓ That's {r.pet.name}</button>
                        <button className={m.is_match ? 'btn' : 'btn primary'} onClick={() => confirm(m, false)}>✗ Not them</button>
                      </div>
                    )}
                    {m.confirmed === true && <span className="chip okchip">confirmed</span>}
                    {m.confirmed === false && <span className="chip">rejected</span>}
                  </div>
                </div>
              )
            })}
          </section>

          <section className="card">
            <div className="row"><b>3 · Search plan &amp; alert</b><span className="spacer" />
              <button className="btn primary" disabled={!canEdit || busy === 'analyze' || !sightings.length} onClick={analyze}>
                {busy === 'analyze' && <span className="spinner" />}
                {busy === 'analyze' ? 'Spark is coordinating…' : 'Generate plan + poster'}
              </button>
            </div>
            {r.summary && <p className="sub">{r.summary}</p>}
            {r.next_search && (
              <div className="plan">
                <h3>➡️ {r.next_search.headline}</h3>
                <p><b>Window:</b> {r.next_search.window} · <b>Area:</b> {r.next_search.area}</p>
                <p>{r.next_search.why}</p>
                <ul>{(r.next_search.steps || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
            {r.poster_url && <img className="poster" src={r.poster_url} alt="alert poster" />}
          </section>
          {err && <p className="err" role="alert">{err}</p>}
        </>
      )}
    </div>
  )
}

export default function App() {
  const hash = useHashRoute()
  const go = h => { location.hash = h }
  if (hash === '#/demo') return <DemoLanding />
  const owner = hash.match(/^#\/r\/(\w+)\/k\/(\w+)$/)
  if (owner) { setToken(owner[1], owner[2]); location.replace(`#/r/${owner[1]}`); return null }
  const give = hash.match(/^#\/r\/(\w+)\/give$/)
  if (give) return <NeighborGive id={give[1]} />
  const m = hash.match(/^#\/r\/(\w+)(\/share)?$/)
  if (m) return <ReportView id={m[1]} share={!!m[2]} />
  return <NewReport go={go} />
}
