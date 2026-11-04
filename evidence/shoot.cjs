/** Render evidence/board.html panels and the live app's pages to PNGs in evidence/img/.
 *   python3 evidence/build.py && node evidence/shoot.cjs [appBaseUrl]
 * appBaseUrl defaults to http://localhost:8787 (wrangler dev). Needs Playwright (preinstalled in CI images). */
const { chromium } = require('playwright')
const path = require('path')
const EV = __dirname
const APP = process.argv[2] || 'http://localhost:8787'
const STATIC = '.nav{position:static !important} *{animation:none !important;transition:none !important}'

;(async () => {
  const b = await chromium.launch()
  for (const scheme of ['light', 'dark']) {
    const p = await (await b.newContext({ viewport: { width: 940, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme })).newPage()
    await p.goto('file://' + path.join(EV, 'board.html'), { waitUntil: 'load' })
    for (const s of await p.$$('section')) {
      const id = await s.getAttribute('id')
      if (scheme === 'dark' && !['headline', 'strength', 'sam-occlusion'].includes(id)) continue
      await s.screenshot({ path: path.join(EV, 'img', `chart-${id}${scheme === 'dark' ? '-dark' : ''}.png`) })
    }
  }
  const shots = [
    ['app-landing-light.jpg', { width: 1440, height: 900 }, 'light', null, false],
    ['app-landing-dark.jpg', { width: 1440, height: 900 }, 'dark', null, false],
    ['app-landing-phone.png', { width: 390, height: 844 }, 'light', null, false],
    ['app-proof-and-ring-comparison.jpg', { width: 1440, height: 900 }, 'light', '.versus', false],
    ['app-how-it-works.jpg', { width: 1440, height: 900 }, 'light', '#how', false],
    ['app-landing-full.jpg', { width: 1440, height: 900 }, 'light', null, true],
  ]
  for (const [name, vp, scheme, sel, full] of shots) {
    const ctx = await b.newContext({ viewport: vp, colorScheme: scheme, ...(vp.width < 500 ? {} : { deviceScaleFactor: 2 }) })
    const p = await ctx.newPage()
    await p.goto(APP + '/', { waitUntil: 'networkidle' })
    await p.addStyleTag({ content: STATIC })
    await p.waitForTimeout(700)
    const out = path.join(EV, 'img', name)
    const fmt = name.endsWith('.jpg') ? { type: 'jpeg', quality: 86 } : {}
    if (sel) await (await p.$(sel)).screenshot({ path: out, ...fmt })
    else await p.screenshot({ path: out, fullPage: full, ...fmt })
    await ctx.close()
  }
  await b.close()
  console.log('rendered')
})().catch((e) => { console.error(e); process.exit(1) })
