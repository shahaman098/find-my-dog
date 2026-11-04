/** One continuous, unedited take of the real product on production (Film 1 / Film 2 source).
 *   node production/capture_prod.cjs https://find-my-dog.kiritokris.workers.dev production/out/12_raw_evidence/take_01
 * Records: CDP screencast frames (3840x2160 JPEG, real timestamps), a HAR of every request, an event log with
 * wall-clock times for every user action and state change, key stills, and the report id + owner token
 * (token written to a separate file that is never published).
 * Refuses to run unless the deployed bundle is the new code.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.argv[2] || 'https://find-my-dog.kiritokris.workers.dev'
const OUT = path.resolve(process.argv[3] || 'production/out/12_raw_evidence/take_01')
const SECRET_OUT = process.env.SECRET_OUT || '/tmp/fmd_take_secret.json'
const ROOT = path.resolve(__dirname, '..')
const FRAMES = path.join(OUT, 'frames')
fs.mkdirSync(FRAMES, { recursive: true })

const t0 = Date.now()
const events = []
const ev = (name, extra = {}) => { const e = { t: (Date.now() - t0) / 1000, wall: new Date().toISOString(), name, ...extra }; events.push(e); console.log(`${e.t.toFixed(2).padStart(7)}s  ${name}`, Object.keys(extra).length ? JSON.stringify(extra).slice(0, 140) : '') }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 4K capture: a real 3840x2160 viewport with the page at 200% zoom renders the 1920x1080 layout with true 4K
// pixels (CDP screencast ignores deviceScaleFactor and would deliver 1080p frames).
const ZOOM = `(() => { const z = () => { document.documentElement.style.zoom = '2' }; if (document.documentElement) z(); document.addEventListener('DOMContentLoaded', z) })()`
const POINTER = `
(() => {
  const mk = () => {
    if (document.getElementById('__fmd_ptr')) return
    const d = document.createElement('div'); d.id = '__fmd_ptr'
    d.style.cssText = 'position:fixed;left:-50px;top:-50px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;' +
      'background:rgba(77,107,254,.25);border:2px solid #4d6bfe;box-shadow:0 0 0 2px rgba(255,255,255,.85);z-index:2147483647;pointer-events:none;transition:transform .12s'
    document.documentElement.appendChild(d)
    const zoom = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1
    addEventListener('mousemove', e => { d.style.left = (e.clientX / zoom()) + 'px'; d.style.top = (e.clientY / zoom()) + 'px' }, true)
    addEventListener('mousedown', () => { d.style.transform = 'scale(.7)' }, true)
    addEventListener('mouseup', () => { d.style.transform = 'scale(1)' }, true)
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mk); else mk()
})()`

async function humanClick(page, locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('no box for click target')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 })
  await sleep(250)
  await locator.click()
}

;(async () => {
  // deploy gate (read-only)
  const html = await (await fetch(BASE + '/')).text()
  const js = html.match(/\/assets\/index-[^"]+\.js/)?.[0]
  const bundle = js ? await (await fetch(BASE + js)).text() : ''
  const health = await (await fetch(BASE + '/api/health')).json()
  if (process.env.DRY_RUN !== '1') { // DRY_RUN=1: local mock rehearsal only; never used for published footage
    if (!bundle.includes('MEASURED ON REAL FOOTAGE')) { console.error(`REFUSING: ${BASE} is not running the new code (bundle ${js})`); process.exit(3) }
    if (health.mock !== false) { console.error('REFUSING: production is in mock mode', health); process.exit(3) }
  }
  ev('deploy_verified', { bundle: js, health })

  // HEADED=1 (default): real Chromium window on Xvfb :99 at 2x scale, recorded by ffmpeg x11grab at a constant
  // 30 fps 3840x2160 -- the browser's own address bar proves which URL is live. CDP screencast is the fallback.
  const HEADED = process.env.HEADED !== '0'
  const browser = HEADED
    ? await chromium.launch({ headless: false, args: ['--force-device-scale-factor=2', '--window-size=1920,1080', '--window-position=0,0', '--no-first-run', '--disable-infobars', '--hide-crash-restore-bubble', '--disable-features=Translate'] })
    : await chromium.launch()
  const ctx = await browser.newContext({ ...(HEADED ? { viewport: null } : { viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 }), colorScheme: 'light',
    recordHar: { path: path.join(OUT, 'network.har'), content: 'embed' } })
  if (!HEADED) await ctx.addInitScript(ZOOM)
  await ctx.addInitScript(POINTER)
  let grab = null
  if (HEADED) {
    const { spawn } = require('child_process')
    grab = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', '3840x2160', '-i', process.env.DISPLAY || ':99',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '17', '-pix_fmt', 'yuv420p', '-threads', '2', path.join(OUT, 'screen_take.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] })
    ev('screen_recording_started')
  }
  const page = await ctx.newPage()
  page.on('dialog', async (d) => { const v = d.message().includes('recorded') ? page.__nextClock : ''; ev('dialog', { message: d.message(), answer: v }); await d.accept(v) })
  page.on('pageerror', (e) => ev('pageerror', { message: e.message }))
  page.on('response', async (r) => {
    const u = new URL(r.url())
    if (!u.pathname.startsWith('/api/')) return
    if (u.pathname.match(/\/(stills|pet_photo|poster|clips\/[a-f0-9]+$)/) && r.request().method() === 'GET') return
    ev('api', { method: r.request().method(), path: u.pathname, status: r.status(), cf_ray: r.headers()['cf-ray'] || null })
  })

  const cdp = await ctx.newCDPSession(page)
  let nframes = 0
  const frameLog = []
  cdp.on('Page.screencastFrame', async (f) => {
    const name = `f${String(nframes++).padStart(6, '0')}.jpg`
    fs.writeFileSync(path.join(FRAMES, name), Buffer.from(f.data, 'base64'))
    frameLog.push({ name, ts: f.metadata.timestamp })
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }) } catch {}
  })
  if (!HEADED) await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 })
  const still = async (name) => { await page.screenshot({ path: path.join(OUT, `still_${name}.png`) }); ev('still', { name }) }

  // 1. clean state: health check, then the landing page
  await page.goto(BASE + '/api/health', { waitUntil: 'load' }); ev('health_page', health)
  await sleep(2200); await still('health')
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }); ev('landing')
  await sleep(1800)

  // 2. file the report (real input)
  const name = page.locator('input[placeholder="Your pet\'s name"]')
  await humanClick(page, name); await page.keyboard.type('Biscuit', { delay: 70 }); ev('typed_name')
  const desc = page.locator('textarea')
  await humanClick(page, desc); await page.keyboard.type('Apricot goldendoodle, curly coat, floppy ears, red collar. Friendly but scared of traffic.', { delay: 22 }); ev('typed_description')
  await page.setInputFiles('input[type=file][accept="image/*"]', path.join(ROOT, 'eval/fixtures/crops/dogpark/t8_f335.jpg')); ev('photo_attached', { file: 't8_f335.jpg' })
  await sleep(700); await still('report_form')
  await humanClick(page, page.locator('button.sendBtn')); ev('submit_report')
  await page.waitForURL(/#\/r\/\w+$/, { timeout: 60000 })
  const rid = page.url().match(/#\/r\/(\w+)/)[1]
  const token = await page.evaluate((id) => localStorage.getItem('fmd_owner_' + id), rid)
  fs.writeFileSync(SECRET_OUT, JSON.stringify({ report_id: rid, owner_token: token }), { mode: 0o600 })
  ev('report_created', { report_id: rid })
  await sleep(1500)

  // 3. two neighbour clips, uploaded together
  const work = path.join(ROOT, 'production/work')
  fs.copyFileSync(path.join(work, 'fountain_10fps.mp4'), path.join(work, 'dog-park-fountain.mp4'))
  fs.copyFileSync(path.join(work, 'doorcam_blurred.mp4'), path.join(work, 'elm-st-doorbell.mp4'))
  await page.locator('label.btn.filelabel').hover()
  await page.setInputFiles('input[type=file][accept="video/*"]', [path.join(work, 'dog-park-fountain.mp4'), path.join(work, 'elm-st-doorbell.mp4')]); ev('clips_selected')
  await page.waitForSelector('text=dog-park-fountain', { timeout: 120000 }); ev('clip_cards_visible')
  // recording times via the real "set time" control
  const chips = page.locator('button.chipbtn')
  for (const [i, clock] of [[0, '5:42 PM'], [1, '6:18 PM']]) {
    page.__nextClock = clock
    await humanClick(page, chips.nth(i)); await sleep(900)
  }
  ev('clocks_set')

  // 4. wait for real SAM 3.1 tracking on both clips + browser still-cutting
  const tWait = Date.now()
  for (;;) {
    const s = await (await fetch(`${BASE}/api/reports/${rid}`)).json()
    const st = s.clips.map((c) => `${c.label}:${c.status}:${c.n_tracks}:${c.still_done}`)
    if (s.clips.length === 2 && s.clips.every((c) => c.status === 'done' && c.still_done)) { ev('tracking_done', { clips: st, waited_s: (Date.now() - tWait) / 1000 }); break }
    if (s.clips.some((c) => c.status === 'error')) { ev('tracking_error', { clips: st }); break }
    if (Date.now() - tWait > 300000) { ev('tracking_timeout', { clips: st }); break }
    await sleep(2000)
  }
  await sleep(2500); await still('tracks')

  // 5. real Muse Spark matching
  await humanClick(page, page.locator('button:has-text("Run matcher")')); ev('match_clicked')
  await page.waitForSelector('.sighting', { timeout: 240000 }); ev('matches_visible')
  await sleep(1200)
  await page.locator('.sighting').first().scrollIntoViewIfNeeded(); await sleep(1500); await still('matches')
  const top = page.locator('.sighting').first()
  const topText = await top.innerText()
  if (!/\d+% match/.test(topText) || /not a match/.test(topText)) { ev('top_card_not_a_match', { text: topText.slice(0, 200) }) }
  else {
    await humanClick(page, top.locator('button:has-text("That\'s Biscuit")')); ev('confirmed_top', { text: topText.split('\n')[0] })
    await page.waitForSelector('text=confirmed'); await sleep(1500)

    // 6. Spark tool loop: plan + Muse Image poster
    const gen = page.locator('button:has-text("Generate plan + poster")')
    await gen.scrollIntoViewIfNeeded(); await sleep(600)
    await humanClick(page, gen); ev('analyze_clicked')
    await page.waitForSelector('img.poster', { timeout: 300000 }); ev('poster_visible')
    await sleep(1500)
    await page.locator('.plan').first().scrollIntoViewIfNeeded(); await sleep(2500); await still('plan')
    await page.locator('img.poster').scrollIntoViewIfNeeded(); await sleep(2500); await still('poster')

    // 7. share page + reload = stored state
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' })); await sleep(1200)
    await humanClick(page, page.locator('a.pill:has-text("Share page")')); ev('share_opened')
    await page.waitForSelector('img.poster', { timeout: 60000 }); await sleep(2000)
    await page.reload({ waitUntil: 'networkidle' }); ev('share_reloaded')
    await page.waitForSelector('img.poster', { timeout: 60000 }); await sleep(2500); await still('share')
    await page.mouse.wheel(0, 1800); await sleep(2500); await still('share_scrolled')
  }
  if (!HEADED) await cdp.send('Page.stopScreencast')
  if (grab) { grab.stdin.write('q'); await new Promise((r) => grab.on('close', r)); ev('screen_recording_stopped') }

  // 8. stranger view (separate context, no token)
  const c2 = await browser.newContext(HEADED ? { viewport: null } : { viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 })
  if (!HEADED) await c2.addInitScript(ZOOM)
  await c2.addInitScript(POINTER)
  const p2 = await c2.newPage()
  await p2.goto(`${BASE}/#/r/${rid}`, { waitUntil: 'networkidle' }); await sleep(1500)
  await p2.screenshot({ path: path.join(OUT, 'still_stranger_view.png') }); ev('stranger_view')
  await c2.close()

  await ctx.close() // flushes the HAR
  await browser.close()
  const final = await (await fetch(`${BASE}/api/reports/${rid}`)).json()
  fs.writeFileSync(path.join(OUT, 'final_state.json'), JSON.stringify(final, null, 1))
  fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify({ base: BASE, t0: new Date(t0).toISOString(), report_id: rid, events, frames: frameLog }, null, 1))
  console.log(`frames: ${nframes}  report: ${rid}  out: ${OUT}`)
})().catch((e) => { console.error('CAPTURE FAIL', e); fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify({ base: BASE, error: String(e), events }, null, 1)); process.exit(1) })
