/** Deterministic frame renderer: loads a timeline page, steps window.setTime(t) for every frame, screenshots
 * at 2x (1920x1080 CSS -> 3840x2160), pipes JPEG frames to ffmpeg. Parallel workers render frame ranges.
 *   node production/render.cjs <page.html> <out.mp4> --fps 30 --duration 120 [--workers 3] [--from 0 --to 120]
 */
const { chromium } = require('playwright')
const { spawn, execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d }
const PAGE = path.resolve(args[0]), OUT = path.resolve(args[1])
const FPS = Number(opt('fps', 30)), DUR = Number(opt('duration', 10)), WORKERS = Number(opt('workers', 3))
const FROM = Number(opt('from', 0)), TO = Number(opt('to', DUR))
const f0 = Math.round(FROM * FPS), f1 = Math.round(TO * FPS)

async function worker(idx, a, b) {
  const part = OUT.replace(/\.mp4$/, `.part${idx}.mp4`)
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), part], { stdio: ['pipe', 'inherit', 'inherit'] })
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })).newPage()
  page.on('pageerror', (e) => console.error(`[w${idx}] pageerror`, e.message))
  await page.goto('file://' + PAGE, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const t0 = Date.now()
  for (let f = a; f < b; f++) {
    await page.evaluate((t) => window.setTime(t), f / FPS)
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 })
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
    if ((f - a) % 150 === 0) console.log(`[w${idx}] frame ${f}/${b}  ${((Date.now() - t0) / Math.max(f - a, 1)).toFixed(0)} ms/frame`)
  }
  ff.stdin.end()
  await new Promise((r) => ff.on('close', r))
  await browser.close()
  return part
}

;(async () => {
  const n = f1 - f0, per = Math.ceil(n / WORKERS)
  const jobs = []
  for (let i = 0; i < WORKERS; i++) {
    const a = f0 + i * per, b = Math.min(f1, a + per)
    if (a < b) jobs.push(worker(i, a, b))
  }
  const parts = await Promise.all(jobs)
  const list = OUT + '.txt'
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'))
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', OUT])
  parts.forEach((p) => fs.unlinkSync(p)); fs.unlinkSync(list)
  console.log('rendered', OUT, `${n} frames`)
})().catch((e) => { console.error(e); process.exit(1) })
