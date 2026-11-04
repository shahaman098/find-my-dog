/** Record a real terminal command: every output chunk with its time offset, plus the exit code.
 *   node production/term_record.cjs <out.json> -- <shell command>
 * Replayed in the films at recorded speed (labelled "recorded terminal session"); nothing is typed or edited.
 * REDACT env (comma-separated values) are replaced with ***** in the saved output.
 */
const { spawn } = require('child_process')
const fs = require('fs')
const out = process.argv[2]
const cmd = process.argv.slice(process.argv.indexOf('--') + 1).join(' ')
const redact = (process.env.REDACT || '').split(',').filter((s) => s.length >= 6)
const clean = (s) => redact.reduce((a, r) => a.split(r).join('*****'), s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
const t0 = Date.now()
const chunks = []
const p = spawn('bash', ['-lc', cmd], { env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } })
const rec = (stream) => (d) => { const s = clean(d.toString()); chunks.push({ t: (Date.now() - t0) / 1000, stream, s }); process[stream].write(s) }
p.stdout.on('data', rec('stdout'))
p.stderr.on('data', rec('stderr'))
p.on('close', (code) => {
  fs.writeFileSync(out, JSON.stringify({ command: process.env.SHOW_CMD || cmd, cwd: process.cwd(), started: new Date(t0).toISOString(), duration: (Date.now() - t0) / 1000, exit_code: code, chunks }, null, 1))
  console.error(`\n[recorded ${chunks.length} chunks, exit ${code}, ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}]`)
  process.exit(0)
})
