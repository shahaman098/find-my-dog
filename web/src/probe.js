/** Client-side video probing: duration from the media element; fps from the mp4
 * container (mdhd timescale/duration + stsz sample count) with a graceful 30fps fallback.
 * No server-side ffmpeg exists — the browser is the media tool.
 */
export async function probeVideo(file) {
  const out = { duration: 0, fps: 30, width: 0, height: 0 }
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    await new Promise((res, rej) => {
      video.onloadedmetadata = res
      video.onerror = () => rej(new Error('video decode failed (HEVC? use Safari or H.264 clips)'))
      video.src = url
    })
    out.duration = video.duration || 0
    out.width = video.videoWidth
    out.height = video.videoHeight
    const fps = await tryFpsFromMp4(file, out.duration)
    if (fps) out.fps = fps
  } finally {
    URL.revokeObjectURL(url)
  }
  return out
}

async function tryFpsFromMp4(file, duration) {
  try {
    const buf = await file.slice(0, 8 * 1024 * 1024).arrayBuffer() // moov is usually up front
    const dv = new DataView(buf)
    let moov = null
    let pos = 0
    while (pos + 8 <= dv.byteLength) {
      const size = dv.getUint32(pos)
      const type = boxType(dv, pos)
      if (size < 8) break
      if (type === 'moov') { moov = { start: pos + 8, end: Math.min(pos + size, dv.byteLength) }; break }
      pos += size
    }
    if (!moov) return null
    const info = { timescale: null, ticks: null, samples: null }
    collect(dv, moov.start, moov.end, info)
    if (info.timescale && info.ticks && info.samples && info.samples > 10) {
      const secs = info.ticks / info.timescale
      const fps = info.samples / secs
      if (secs > 0.5 && fps >= 5 && fps <= 120) return Math.round(fps * 100) / 100
    }
    return null
  } catch {
    return null
  }
}

function boxType(dv, pos) {
  return String.fromCharCode(dv.getUint8(pos + 4), dv.getUint8(pos + 5), dv.getUint8(pos + 6), dv.getUint8(pos + 7))
}

/** Walk the first trak's mdhd + stsz inside moov. */
function collect(dv, start, end, info, depth = 0) {
  let pos = start
  while (pos + 8 <= end && depth < 6) {
    let size = dv.getUint32(pos)
    const type = boxType(dv, pos)
    let head = 8
    if (size === 1) { size = Number(dv.getBigUint64(pos + 8)); head = 16 }
    if (size < 8) break
    const body = pos + head
    if (type === 'mdhd' && info.timescale === null) {
      const ver = dv.getUint8(body)
      if (ver === 1) { info.timescale = dv.getUint32(body + 20); info.ticks = Number(dv.getBigUint64(body + 24)) }
      else { info.timescale = dv.getUint32(body + 12); info.ticks = dv.getUint32(body + 16) }
    } else if (type === 'stsz' && info.samples === null) {
      const fixed = dv.getUint32(body + 4)
      const count = dv.getUint32(body + 8)
      if (count > 0 && (fixed > 0 || dv.byteLength >= body + 12 + count * 4)) info.samples = count
    } else if (['trak', 'mdia', 'minf', 'stbl'].includes(type)) {
      collect(dv, body, Math.min(pos + size, end), info, depth + 1)
      if (info.timescale !== null && info.samples !== null) return
    }
    pos += size
  }
}

/** Extract a cropped still from a clip at time t. `box` is in native media pixels
 * (same coordinate space SAM returns). Returns a JPEG blob. */
export async function extractStill(file, t, box) {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.src = url
    await new Promise((res, rej) => {
      video.onloadedmetadata = res
      video.onerror = () => rej(new Error('video decode failed'))
    })
    await new Promise((res) => { video.onseeked = res; video.currentTime = Math.max(t - 0.05, 0) })
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const pad = 0.08
    const sx = Math.max(0, box.x1 - pad * (box.x2 - box.x1))
    const sy = Math.max(0, box.y1 - pad * (box.y2 - box.y1))
    const sw = Math.min(canvas.width - sx, (box.x2 - box.x1) * (1 + 2 * pad))
    const sh = Math.min(canvas.height - sy, (box.y2 - box.y1) * (1 + 2 * pad))
    const out = document.createElement('canvas')
    out.width = Math.max(2, Math.round(sw))
    out.height = Math.max(2, Math.round(sh))
    out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height)
    return await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.85))
  } finally {
    URL.revokeObjectURL(url)
  }
}
