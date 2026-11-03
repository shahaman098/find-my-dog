import React, { useEffect, useRef, useState } from 'react'
import { blobToWavBlob } from './wav.js'
import { probeVideo, extractStill } from './probe.js'

const api = (path, opts) => fetch(`/api${path}`, opts).then(async r => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || (await r.text()).slice(0, 200))
  return r.json()
})

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

function Recorder({ onDone }) {
  const [rec, setRec] = useState(null)
  const [recording, setRecording] = useState(false)
  const chunks = useRef([])
  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const r = new MediaRecorder(stream)
    chunks.current = []
    r.ondataavailable = e => chunks.current.push(e.data)
    r.onstop = () => onDone(new Blob(chunks.current))
    r.start()
    setRec(r)
    setRecording(true)
  }
  return (
    <button type="button" className={recording ? 'pill recording' : 'pill'} onClick={() => (recording ? (rec.stop(), setRecording(false)) : start())}>
      {recording ? '⏺ Stop' : '🎙 Voice note'}
    </button>
  )
}

function Brand() {
  return <div className="brand"><span className="paw">🐾</span>findmydog</div>
}

function Nav({ showDemo }) {
  return (
    <nav className="nav">
      <Brand />
      <span className="spacer" />
      {showDemo && <a className="pill" href="#/demo">Live demo</a>}
      <a className="pill" href="https://github.com/shahaman098/find-my-dog" target="_blank" rel="noreferrer">Open source</a>
    </nav>
  )
}

function NewReport({ go }) {
  const [form, setForm] = useState({ pet_name: '', species: 'dog', description: '' })
  const [photo, setPhoto] = useState(null)
  const [voice, setVoice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.set('pet_name', form.pet_name)
      fd.set('species', form.species)
      fd.set('description', form.description)
      if (photo) fd.set('photo', photo)
      if (voice) fd.set('voice_note', await blobToWavBlob(voice), 'voice.wav')
      const r = await api('/reports', { method: 'POST', body: fd })
      go(`#/r/${r.report_id}`)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div>
      <Nav />
      <div className="hero">
        <p className="announce"><span className="spark">✨</span>SAM 3.1 watches every clip your street already recorded, with a persistent identity for each animal. Muse Spark knows which one is yours. →</p>
        <h1 className="heroTitle">Bring them home</h1>
        <form className="inputCard" onSubmit={submit}>
          <input required type="text" placeholder="Your pet's name" value={form.pet_name}
            onChange={e => setForm({ ...form, pet_name: e.target.value })} />
          <textarea placeholder="Describe them — coat, markings, collar, size…" value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })} />
          <div className="inputRow">
            <span className="pill">
              <select value={form.species} onChange={e => setForm({ ...form, species: e.target.value })}>
                <option value="dog">Dog</option><option value="cat">Cat</option><option value="other">Other</option>
              </select>
            </span>
            <label className="filelabel pill">📷 {photo ? photo.name.slice(0, 18) : 'Photo'}
              <input required type="file" accept="image/*" onChange={e => setPhoto(e.target.files[0])} />
            </label>
            <Recorder onDone={setVoice} />
            {voice && <span className="ok">✓ ready</span>}
            <button className="sendBtn" disabled={busy} title="Start the search">{busy ? '…' : '↑'}</button>
          </div>
          {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
        </form>
        <div className="heroPills">
          <a className="pill" href="#/demo">▷ Live demo</a>
          <span className="pill">🔐 Opt-in · time-boxed · no face recognition</span>
          <a className="pill" href="https://github.com/shahaman098/find-my-dog" target="_blank" rel="noreferrer">⌘ Open source</a>
        </div>
        <div className="steps">
          <div className="step"><b><span className="n">1</span>File the report</b><span>A photo, a description, a panicked voice note — 30 seconds.</span></div>
          <div className="step"><b><span className="n">2</span>Any camera joins</b><span>Doorbell cams, home cams, dashcams. Whatever a neighbor will share.</span></div>
          <div className="step"><b><span className="n">3</span>Evidence, not hope</b><span>A sighting timeline, a search plan for dawn, and a poster for the street.</span></div>
        </div>
      </div>
    </div>
  )
}

async function extractStillsFor(report, clip) {
  const file = fileCache[clip.clip_id]
  if (!file) return false
  let ok = 0
  for (const t of clip.tracks || []) {
    if (t.n_frames === 0) continue
    try {
      const best = t.detections.reduce((a, b) => ((b.confidence ?? 0) > (a.confidence ?? 0) ? b : a))
      const blob = await extractStill(file, best.t, best.box)
      const resp = await fetch(`/api/reports/${report.report_id}/stills/${clip.clip_id}/${t.object_id}`, { method: 'PUT', body: blob })
      if (resp.ok) ok++
    } catch (e) { console.warn('still extract failed', e) }
  }
  if (ok > 0) {
    await api(`/reports/${report.report_id}/clips/${clip.clip_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ still_done: true }) })
  }
  return ok > 0
}

function ClipCard({ report, clip, onRefresh }) {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (clip.status === 'done' && !clip.still_done && fileCache[clip.clip_id]) {
      setBusy(true)
      extractStillsFor(report, clip).then(onRefresh).finally(() => setBusy(false))
    }
  }, [clip.status, clip.still_done])
  const still = id => `/api/reports/${report.report_id}/stills/${clip.clip_id}/${id}`
  const statusChip = { queued: '⏳ queued', uploading: '⬆️', tracking: '👁 SAM 3.1 tracking…', extracting: '✂️', done: '✅ done', error: '❌' }[clip.status] || clip.status
  async function reclock(e) {
    const clock = prompt('When was this recorded? (e.g. 7:42 PM)', clip.captured_clock)
    if (clock === null) return
    await api(`/reports/${report.report_id}/clips/${clip.clip_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ captured_clock: clock }) })
    onRefresh()
  }
  return (
    <div className="card">
      <div className="row">
        <b>{clip.label}</b>
        <button className="chip chipbtn" onClick={reclock} title="Set recording time">🕐 {clip.captured_clock || 'set time'}</button>
        <span className="chip">{statusChip}</span>
        <span className="chip">{clip.n_tracks || 0} animals</span>
        <span className="chip">{(clip.duration_s || 0).toFixed(0)}s</span>
      </div>
      {clip.status === 'error' && <p className="err">{clip.error}</p>}
      {clip.status === 'done' && (
        <div className="gallery">
          {(clip.tracks || []).map(t => (
            <div key={t.object_id} className="still">
              <img src={still(t.object_id)} alt={`track ${t.object_id}`}
                onError={e => { e.currentTarget.replaceWith(Object.assign(document.createElement('div'), { className: 'stillMissing', textContent: busy ? 'cutting stills…' : 'still unavailable' })) }} />
              <span>track #{t.object_id} · {t.first_seen.toFixed(0)}s–{t.last_seen.toFixed(0)}s · {t.n_frames}f</span>
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
  useEffect(() => { api(`/reports/${id}/timeline`).then(setTl).catch(() => {}) }, [id])
  const sightings = tl?.sightings ?? []
  return (
    <div className="card center">
      <h2>🔎 Sightings of {r.pet.name}</h2>
      <p className="sub">Owner-initiated search · opt-in footage only · no person identification</p>
      {tl && sightings.length > 0 && <Ribbon sightings={sightings} petName={r.pet.name} />}
      {!tl && <p className="sub">Loading…</p>}
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
      {tl?.poster && <img className="poster" src={tl.poster} alt="alert poster" />}
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
    setErr('')
    try {
      const probe = await probeVideo(file).catch(() => ({ fps: 30, duration: 0 }))
      const fd = new FormData()
      fd.set('file', file)
      fd.set('label', e.target.label.value || 'Neighbor cam')
      fd.set('captured_clock', clock)
      fd.set('fps', String(probe.fps))
      fd.set('duration', String(probe.duration))
      fileCache[id + ':' + file.name] = file // stills extracted when owner views; neighbor page may close after
      await api(`/reports/${id}/clips`, { method: 'POST', body: fd })
      setDone(true)
    } catch (e2) { setErr(e2.message) }
  }
  if (err) return <div className="card center"><p className="err">{err}</p></div>
  if (!r) return <div className="card center">Loading…</div>
  return (
    <div>
      <Nav />
      <div className="card center">
        <h1>🤝 Help find {r.pet.name}</h1>
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
        <p className="sub small">Opt-in only · time-boxed to this search · animals matched by appearance, never people.</p>
      </div>
    </div>
  )
}

function ReportView({ id, share }) {
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const refresh = () => api(`/reports/${id}`).then(setR).catch(e => setErr(e.message))
  useEffect(() => { refresh() }, [id])
  useEffect(() => {
    if (!r || share) return
    const pending = r.clips?.some(c => ['queued', 'uploading', 'tracking', 'extracting'].includes(c.status))
    if (pending) { const t = setTimeout(refresh, 2500); return () => clearTimeout(t) }
  }, [r])

  if (err) return <div className="card center"><p className="err">{err}</p><a className="btn" href="#/">Start a report</a></div>
  if (!r) return <div className="card center">Loading…</div>

  async function addClips(e) {
    for (const f of [...e.target.files]) {
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
  const nStillMissing = (r.clips || []).some(c => c.status === 'done' && !c.still_done && !fileCache[c.clip_id])

  return (
    <div>
      <Nav />
      <header className="topbar">
        <b style={{ fontSize: 17 }}>Searching for {r.pet.name}</b>
        <span className="chip">{r.pet.species}</span>
        {r.transcript && <span className="chip">🎙 transcribed</span>}
        <span className="chip">search cost ${r.cost?.usd?.toFixed?.(2) ?? '0.00'}</span>
        <span className="spacer" />
        {sightings.length > 0 && <a className="pill" href={`#/r/${id}/share`}>🔗 Share page</a>}
        <a className="pill" href={`#/r/${id}/give`}>🤝 Neighbor link</a>
      </header>

      {share ? <ShareView id={id} r={r} /> : (
        <>
          <section className="card">
            <div className="row"><b>1 · Neighborhood footage</b><span className="spacer" />
              <label className="btn filelabel">+ Add clips
                <input type="file" accept="video/*" multiple onChange={addClips} />
              </label>
            </div>
            <p className="sub">Doorbell cams, home cams, dashcams — anything a neighbor will share. Set each clip's recording time for the timeline.</p>
            {(r.clips || []).map(c => <ClipCard key={c.clip_id} report={r} clip={c} onRefresh={refresh} />)}
            {(r.clips || []).length === 0 && <p className="sub">No clips yet.</p>}
            {nStillMissing && <p className="sub small">Tip: stills for clips uploaded in a previous session are cut by re-adding the clip.</p>}
          </section>

          <section className="card">
            <div className="row"><b>2 · Is one of them {r.pet.name}?</b><span className="spacer" />
              <button className="btn primary" disabled={busy === 'match' || !(r.clips || []).some(c => c.status === 'done')} onClick={runMatch}>
                {busy === 'match' ? 'Matching…' : `Run matcher${r.matcher_model && r.matcher_model !== 'mock' ? ` (${r.matcher_model.split(':')[0]})` : ''}`}
              </button>
            </div>
            {(r.matches || []).length === 0 && <p className="sub">Run the matcher after clips finish processing.</p>}
            {(r.matches || []).map(m => {
              const clip = r.clips.find(c => c.clip_id === m.clip_id)
              return (
                <div key={`${m.clip_id}:${m.object_id}`} className="sighting">
                  <img src={`/api/reports/${id}/stills/${m.clip_id}/${m.object_id}`} />
                  <div>
                    <b>{clip?.label}</b> · {(m.score * 100).toFixed(0)}% · {m.is_match ? 'possible match' : 'no match'}
                    <p className="sub">{m.rationale}</p>
                    {m.confirmed === null && (
                      <div className="row">
                        <button className="btn primary" onClick={() => confirm(m, true)}>✓ That's {r.pet.name}</button>
                        <button className="btn" onClick={() => confirm(m, false)}>✗ Not them</button>
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
              <button className="btn primary" disabled={busy === 'analyze' || !sightings.length} onClick={analyze}>
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
            {r.poster && <img className="poster" src={`/api/reports/${id}/poster`} alt="alert poster" />}
          </section>
          {err && <p className="err">{err}</p>}
        </>
      )}
    </div>
  )
}

export default function App() {
  const hash = useHashRoute()
  const go = h => { location.hash = h }
  const give = hash.match(/^#\/r\/(\w+)\/give$/)
  if (give) return <NeighborGive id={give[1]} />
  const m = hash.match(/^#\/r\/(\w+)(\/share)?$/)
  if (m) return <ReportView id={m[1]} share={!!m[2]} />
  return <NewReport go={go} />
}
