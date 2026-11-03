import React, { useEffect, useRef, useState } from 'react'

const api = (path, opts) => fetch(`/api${path}`, opts).then(async r => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText)
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

function Recorder({ onDone }) {
  const [rec, setRec] = useState(null)
  const [recording, setRecording] = useState(false)
  const chunks = useRef([])
  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const r = new MediaRecorder(stream)
    chunks.current = []
    r.ondataavailable = e => chunks.current.push(e.data)
    r.onstop = () => onDone(new Blob(chunks.current, { type: 'audio/webm' }))
    r.start()
    setRec(r)
    setRecording(true)
  }
  return (
    <button type="button" className={recording ? 'btn recording' : 'btn'} onClick={() => (recording ? (rec.stop(), setRecording(false)) : start())}>
      {recording ? '⏺ Stop voice note' : '🎙 Record voice note'}
    </button>
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
      if (voice) fd.set('voice_note', voice, 'voice.webm')
      const r = await api('/reports', { method: 'POST', body: fd })
      go(`#/r/${r.report_id}`)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="card center">
      <h1>🐾 Find My Dog</h1>
      <p className="sub">Your pet is missing. Every camera on your street already filmed the answer.</p>
      <form onSubmit={submit}>
        <input required placeholder="Pet's name" value={form.pet_name}
          onChange={e => setForm({ ...form, pet_name: e.target.value })} />
        <select value={form.species} onChange={e => setForm({ ...form, species: e.target.value })}>
          <option value="dog">Dog</option><option value="cat">Cat</option><option value="other">Other</option>
        </select>
        <textarea placeholder="Describe them: coat color, markings, collar, size…"
          value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <label className="filelabel">📷 Reference photo{photo ? `: ${photo.name}` : ' (required)'}
          <input required type="file" accept="image/*" onChange={e => setPhoto(e.target.files[0])} />
        </label>
        <Recorder onDone={setVoice} />
        {voice && <span className="ok"> voice note ready</span>}
        {err && <p className="err">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Filing report…' : 'Start the search'}</button>
      </form>
    </div>
  )
}

function ClipCard({ report, clip, onRefresh }) {
  const still = id => `/api/reports/${report.report_id}/stills/${clip.clip_id}/${id}`
  const statusChip = { queued: '⏳', uploading: '⬆️', tracking: '👁 SAM 3.1…', extracting: '✂️', done: '✅', error: '❌' }[clip.status] || clip.status
  return (
    <div className="card">
      <div className="row">
        <b>{clip.label}</b>
        {clip.captured_clock && <span className="chip">{clip.captured_clock}</span>}
        <span className="chip">{statusChip} {clip.status}</span>
        <span className="chip">{clip.n_tracks || 0} animals</span>
      </div>
      {clip.status === 'error' && <p className="err">{clip.error}</p>}
      {clip.status === 'done' && (
        <div className="gallery">
          {(clip.tracks || []).map(t => (
            <div key={t.object_id} className="still">
              <img src={still(t.object_id)} alt={`track ${t.object_id}`} />
              <span>track #{t.object_id} · {t.first_seen.toFixed(0)}s–{t.last_seen.toFixed(0)}s · {t.n_frames}f</span>
            </div>
          ))}
        </div>
      )}
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
    const pending = r.clips.some(c => ['queued', 'uploading', 'tracking', 'extracting'].includes(c.status))
    if (pending) { const t = setTimeout(refresh, 3000); return () => clearTimeout(t) }
  }, [r])

  if (err) return <div className="card center"><p className="err">{err}</p></div>
  if (!r) return <div className="card center">Loading…</div>

  const matchById = {}
  for (const m of r.matches || []) matchById[`${m.clip_id}:${m.object_id}`] = m

  async function addClips(e) {
    const files = [...e.target.files]
    for (const f of files) {
      const fd = new FormData()
      fd.set('file', f)
      fd.set('label', f.name.replace(/\.[^.]+$/, ''))
      fd.set('captured_clock', '')
      await api(`/reports/${id}/clips`, { method: 'POST', body: fd })
    }
    refresh()
  }
  async function runMatch() {
    setBusy('match')
    try { await api(`/reports/${id}/match`, { method: 'POST' }); await refresh() }
    catch (e) { setErr(e.message) } finally { setBusy('') }
  }
  async function confirm(m, v) {
    await api(`/reports/${id}/matches/confirm?clip_id=${m.clip_id}&object_id=${m.object_id}&confirmed=${v}`, { method: 'POST' })
    refresh()
  }
  async function analyze() {
    setBusy('analyze')
    try { await api(`/reports/${id}/analyze`, { method: 'POST' }); await refresh() }
    catch (e) { setErr(e.message) } finally { setBusy('') }
  }

  const sightings = (r.matches || []).filter(m => m.confirmed)
  const canShare = sightings.length > 0

  return (
    <div>
      <header className="topbar">
        <b>🐾 {r.pet.name}</b>
        <span className="chip">{r.pet.species}</span>
        {r.transcript && <span className="chip">🎙 transcribed</span>}
        <span className="spacer" />
        {canShare && <a className="btn" href={`#/r/${id}/share`}>🔗 Share page</a>}
      </header>

      {share ? (
        <div className="card center">
          <h2>Sightings of {r.pet.name}</h2>
          {sightings.map(m => {
            const clip = r.clips.find(c => c.clip_id === m.clip_id)
            return (
              <div key={`${m.clip_id}:${m.object_id}`} className="sighting">
                <img src={`/api/reports/${id}/stills/${m.clip_id}/${m.object_id}`} />
                <div>
                  <b>{clip?.captured_clock || 'time unknown'}</b> — {clip?.label}
                  <p className="sub">{m.rationale}</p>
                </div>
              </div>
            )
          })}
          {r.next_search && (
            <div className="plan">
              <h3>➡️ {r.next_search.headline}</h3>
              <p><b>Window:</b> {r.next_search.window} · <b>Area:</b> {r.next_search.area}</p>
              <p>{r.next_search.why}</p>
              <ul>{(r.next_search.steps || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {r.poster && <img className="poster" src={`/api/reports/${id}/poster`} alt="alert poster" />}
        </div>
      ) : (
        <>
          <section className="card">
            <div className="row"><b>1 · Neighborhood footage</b><span className="spacer" />
              <label className="btn filelabel">+ Add clips
                <input type="file" accept="video/*" multiple onChange={addClips} />
              </label>
            </div>
            <p className="sub">Doorbell cams, home cams, dashcams — anything a neighbor will share. Opt-in only, time-boxed to the search window.</p>
            {(r.clips || []).map(c => <ClipCard key={c.clip_id} report={r} clip={c} />)}
            {(r.clips || []).length === 0 && <p className="sub">No clips yet.</p>}
          </section>

          <section className="card">
            <div className="row"><b>2 · Is one of them {r.pet.name}?</b><span className="spacer" />
              <button className="btn primary" disabled={busy === 'match' || !(r.clips || []).some(c => c.status === 'done')} onClick={runMatch}>
                {busy === 'match' ? 'Matching…' : `Run matcher${r.matcher_model ? ` (${r.matcher_model.split(':')[0]})` : ''}`}
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
                {busy === 'analyze' ? 'Spark is thinking…' : 'Generate plan + poster'}
              </button>
            </div>
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
  const m = hash.match(/^#\/r\/(\w+)(\/share)?$/)
  if (m) return <ReportView id={m[1]} share={!!m[2]} />
  return <NewReport go={go} />
}
