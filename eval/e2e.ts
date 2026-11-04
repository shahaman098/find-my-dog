/** End-to-end test against a running worker (wrangler dev or deployed URL).
 * Usage: node eval/e2e.ts [baseURL]
 * Every step asserts; exits nonzero on the first broken step.
 */
import { fileURLToPath } from 'node:url'

const BASE = process.argv[2] ?? 'http://localhost:8787'

function assert(cond: boolean, label: string, extra = '') {
  if (!cond) {
    console.error(`FAIL: ${label} ${extra}`)
    process.exit(1)
  }
  console.log(`ok: ${label}`)
}

async function j<T = any>(resp: Response): Promise<T> {
  if (!resp.ok) throw new Error(`${resp.status} ${(await resp.text()).slice(0, 200)}`)
  return resp.json() as Promise<T>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // 0. health
  const health = await j<any>(await fetch(`${BASE}/api/health`))
  assert(health.ok === true, 'health ok')
  console.log(`   mode: ${health.mock ? 'MOCK' : 'REAL'}, matcher: ${health.matcher}`)

  // 1. create report (photo = fixture frame)
  const fs = await import('node:fs')
  const petPath = fileURLToPath(new URL('./fixtures/pet.jpg', import.meta.url))
  assert(fs.existsSync(petPath), 'pet photo fixture exists')
  const jpeg = fs.readFileSync(petPath)
  const form = new FormData()
  form.set('pet_name', 'Biscuit')
  form.set('species', 'dog')
  form.set('description', 'tan coat, white chest patch, curled tail, red collar')
  form.set('photo', new Blob([jpeg], { type: 'image/jpeg' }), 'pet.jpg')
  const report = await j<any>(await fetch(`${BASE}/api/reports`, { method: 'POST', body: form }))
  assert(!!report.report_id, `report created ${report.report_id}`)
  assert(!!report.pet.photo_url, 'pet photo stored')
  assert(typeof report.owner_token === 'string' && report.owner_token.length >= 32, 'owner token issued at creation')
  const OWN = { 'X-Owner-Token': report.owner_token }
  const pub = await j<any>(await fetch(`${BASE}/api/reports/${report.report_id}`))
  assert(!('owner_token' in pub), 'owner token never returned by GET')

  // 2. upload fixture clip (if present) and wait for the pipeline
  const clipPath = fileURLToPath(new URL('./fixtures/dog_clip.mp4', import.meta.url))
  if (fs.existsSync(clipPath)) {
    const clipForm = new FormData()
    clipForm.set('file', new Blob([fs.readFileSync(clipPath)], { type: 'video/mp4' }), 'dog_clip.mp4')
    clipForm.set('label', 'Front door cam')
    clipForm.set('captured_clock', '7:42 PM')
    // real fixture fps/duration probed via ffmpeg is unnecessary in mock mode
    clipForm.set('fps', '3')
    clipForm.set('duration', '9')
    const clip = await j<any>(await fetch(`${BASE}/api/reports/${report.report_id}/clips`, { method: 'POST', body: clipForm }))
    assert(clip.status === 'queued', 'clip queued')
    let done = false
    for (let i = 0; i < 40 && !done; i++) {
      await sleep(1000)
      const s = await j<any>(await fetch(`${BASE}/api/reports/${report.report_id}`))
      const c2 = s.clips.find((x: any) => x.clip_id === clip.clip_id)
      if (c2.status === 'done') done = true
      if (c2.status === 'error') throw new Error(`clip failed: ${c2.error}`)
    }
    assert(done, 'clip tracked by pipeline')
  } else {
    console.log('skip clip upload: no fixture')
  }

  // 3. match (owner-only: a stranger with the share link is refused)
  const stranger = await fetch(`${BASE}/api/reports/${report.report_id}/match`, { method: 'POST', headers: { 'X-Owner-Token': 'nope' } })
  assert(stranger.status === 403, 'non-owner cannot run matcher', `got ${stranger.status}`)
  const afterMatch = await j<any>(await fetch(`${BASE}/api/reports/${report.report_id}/match`, { method: 'POST', headers: OWN }))
  assert(Array.isArray(afterMatch.matches) && afterMatch.matches.length > 0, `matches produced (${afterMatch.matches.length})`)

  // 4. confirm the best match
  const best = afterMatch.matches.find((m: any) => m.is_match) ?? afterMatch.matches[0]
  await j(await fetch(`${BASE}/api/reports/${report.report_id}/matches/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...OWN },
    body: JSON.stringify({ clip_id: best.clip_id, object_id: best.object_id, confirmed: true }),
  }))
  const s2 = await j<any>(await fetch(`${BASE}/api/reports/${report.report_id}`))
  assert(s2.matches.some((m: any) => m.confirmed === true), 'match confirmed')
  const rematch = await j<any>(await fetch(`${BASE}/api/reports/${report.report_id}/match`, { method: 'POST', headers: OWN }))
  assert(rematch.matches.some((m: any) => m.confirmed === true), 're-running matcher keeps confirmations')

  // 5. analyze (tool loop in real mode; canned in mock)
  const analysis = await j<any>(await fetch(`${BASE}/api/reports/${report.report_id}/analyze`, { method: 'POST', headers: OWN }))
  assert(!!analysis.next_search?.headline, `search plan: "${analysis.next_search?.headline}"`)
  assert(!!analysis.poster, 'poster generated')

  // 6. share-facing artifacts
  const tl = await j<any>(await fetch(`${BASE}/api/reports/${report.report_id}/timeline`))
  assert(tl.sightings.length > 0, `timeline has ${tl.sightings.length} sighting(s)`)
  const poster = await fetch(`${BASE}${tl.poster}`)
  assert(poster.ok, 'poster fetchable')
  const photo = await fetch(`${BASE}${report.pet.photo_url}`)
  assert(photo.ok, 'pet photo fetchable')
  const s3 = await j<any>(await fetch(`${BASE}/api/reports/${report.report_id}`))
  assert(s3.poster_url === tl.poster, 'owner view exposes poster_url')

  // 7. the seeded demo report is read-only for everyone
  const demo = await j<any>(await fetch(`${BASE}/api/demo`))
  if (demo.id) {
    const d = await fetch(`${BASE}/api/reports/${demo.id}/analyze`, { method: 'POST' })
    assert(d.status === 403, 'demo report is read-only', `got ${d.status}`)
    const dc = await fetch(`${BASE}/api/reports/${demo.id}/clips`, { method: 'POST', body: new FormData() })
    assert(dc.status === 403, 'demo report refuses new clips', `got ${dc.status}`)
  } else {
    console.log('skip demo read-only check: no seeded demo report on this deployment')
  }

  console.log(`\nE2E PASS (${health.mock ? 'mock' : 'real'} mode) — search cost so far: $${tl.cost?.usd ?? 0}`)
}

main().catch((e) => {
  console.error('E2E FAIL:', e.message)
  process.exit(1)
})
