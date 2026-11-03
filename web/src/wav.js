/** Client-side audio conversion: MediaRecorder output (webm/mp4) -> 16kHz mono WAV.
 * Meta's ASR endpoint accepts WAV (mono PCM) only, and Workers can't run ffmpeg,
 * so the browser does the conversion with WebAudio.
 */
export async function blobToWavBlob(blob) {
  const arrayBuf = await blob.arrayBuffer()
    const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  try {
    const audio = await ctx.decodeAudioData(arrayBuf)
    return encodeWav(toMono16k(audio, ctx.sampleRate), 16000)
  } finally {
    ctx.close()
  }
}

function toMono16k(audio, inRate) {
  // average channels
  const n = audio.length
  const mono = new Float32Array(n)
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const data = audio.getChannelData(ch)
    for (let i = 0; i < n; i++) mono[i] += data[i] / audio.numberOfChannels
  }
  if (inRate === 16000) return mono
  // linear resample to 16k
  const outLen = Math.floor((n * 16000) / inRate)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = (i * inRate) / 16000
    const i0 = Math.floor(src)
    const frac = src - i0
    const a = mono[Math.min(i0, n - 1)]
    const b = mono[Math.min(i0 + 1, n - 1)]
    out[i] = a + (b - a) * frac
  }
  return out
}

function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, samples.length * 2, true)
  let off = 44
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}
