/** Film 3 concept imagery via Muse Image (marked "concept imagery" on screen; never used as product proof).
 *   META_API_KEY=... node production/concept_images.mjs production/out/concept
 */
import fs from 'node:fs'
import path from 'node:path'
import { imageType } from '../worker/src/meta.ts'

async function generate(env, prompt, size) {
  const r = await fetch('https://api.meta.ai/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${env.META_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'muse-image-1.0', prompt, size }) })
  if (!r.ok) throw new Error(`image ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const j = await r.json(); const bytes = Buffer.from(j.data[0].b64_json, 'base64')
  return { png: bytes, contentType: imageType(new Uint8Array(bytes)) }
}

const out = process.argv[2] || 'production/out/concept'
const SIZE = process.env.SIZE || '1536x1024'
fs.mkdirSync(out, { recursive: true })
const env = { META_API_KEY: process.env.META_API_KEY }
const STYLE = 'Photorealistic cinematic film still, anamorphic 2.39 lens look, shallow depth of field, natural light, subtle film grain, muted colour grade, no text, no logos, no watermarks, no visible faces.'
const SHOTS = {
  gate: `A suburban back garden at blue hour: a wooden garden gate stands half open onto an empty lane, a red dog lead lying on the wet path. Quiet, slightly unsettling stillness. ${STYLE}`,
  street: `A row of terraced houses at dusk seen from across a damp street, several small doorbell cameras glowing on front doors, warm windows, one streetlight just switching on. ${STYLE}`,
  doorstep: `Over-the-shoulder view from behind a person standing on a dark front doorstep at night, holding a phone with a lit screen, looking down an empty street; their face is not visible. ${STYLE}`,
  home: `Early morning golden light on a quiet residential street: seen from behind, a person walks home with an apricot curly-coated goldendoodle on a red lead; calm and warm, long soft shadows. Their face is not visible. ${STYLE}`,
}
for (const [name, prompt] of Object.entries(SHOTS)) {
  const file = path.join(out, `${name}_${SIZE}.img`)
  if (fs.existsSync(file + '.json')) { console.log('skip', name); continue }
  const t0 = Date.now()
  const r = await generate(env, prompt, SIZE)
  const ext = r.contentType === 'image/webp' ? 'webp' : r.contentType === 'image/png' ? 'png' : 'jpg'
  fs.writeFileSync(path.join(out, `${name}_${SIZE}.${ext}`), new Uint8Array(r.png))
  fs.writeFileSync(file + '.json', JSON.stringify({ name, prompt, model: 'muse-image-1.0', size: SIZE, contentType: r.contentType, seconds: (Date.now() - t0) / 1000 }, null, 1))
  console.log(name, r.contentType, ((Date.now() - t0) / 1000).toFixed(1) + 's')
}
