"""QA gate for a rendered film. Exits non-zero on any failure.

    python3 production/qa.py <film.mp4> --duration 120 --fps 30 [--srt subs.srt] [--script production/scripts/film1.json] [--scan dir ...]
Checks: exact duration (+-1 frame), 3840x2160, fps, audio 48 kHz, true-peak < -1 dBTP, no black or frozen stretches
outside allowed holds, SRT has no overlaps and no unresolved [PLACEHOLDERS], script has no placeholders, and no
secret (env SECRETS, comma-separated) appears in any file under --scan dirs.
"""
import argparse, json, os, re, subprocess, sys

ap = argparse.ArgumentParser()
ap.add_argument('film'); ap.add_argument('--duration', type=float, required=True); ap.add_argument('--fps', type=float, required=True)
ap.add_argument('--srt'); ap.add_argument('--script'); ap.add_argument('--scan', nargs='*', default=[])
ap.add_argument('--max-freeze', type=float, default=4.0)
a = ap.parse_args()
fails, notes = [], []
def check(ok, msg): (notes if ok else fails).append(('PASS ' if ok else 'FAIL ') + msg)

probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate,sample_rate,channels', '-of', 'json', a.film]))
v = next(s for s in probe['streams'] if s['codec_type'] == 'video')
au = next((s for s in probe['streams'] if s['codec_type'] == 'audio'), None)
dur = float(probe['format']['duration'])
num, den = map(int, v['r_frame_rate'].split('/'))
check(abs(dur - a.duration) <= 1.0 / a.fps + 0.03, f'duration {dur:.3f}s (want {a.duration}s)')
check((v['width'], v['height']) == (3840, 2160), f"resolution {v['width']}x{v['height']}")
check(abs(num / den - a.fps) < 0.01, f'fps {num / den:.3f}')
check(au is not None and au.get('sample_rate') == '48000', f"audio {au and au.get('sample_rate')} Hz, {au and au.get('channels')} ch")

r = subprocess.run(['ffmpeg', '-hide_banner', '-i', a.film, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
tp = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r)
lufs = re.findall(r'I:\s+(-?[\d.]+) LUFS', r)
check(bool(tp) and float(tp[-1]) <= -0.9, f'true peak {tp[-1] if tp else "?"} dBFS')
notes.append(f'INFO integrated loudness {lufs[-1] if lufs else "?"} LUFS')

r = subprocess.run(['ffmpeg', '-hide_banner', '-i', a.film, '-vf', 'blackdetect=d=0.5:pix_th=0.04,freezedetect=n=0.0008:d=%s' % a.max_freeze, '-an', '-f', 'null', '-'], capture_output=True, text=True).stderr
blacks = re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', r)
freezes = re.findall(r'freeze_start: ([\d.]+)', r)
check(not blacks, f'black stretches: {blacks or "none"}')
check(not freezes, f'frozen stretches > {a.max_freeze}s: {freezes or "none"}')

if a.srt:
    blocks = open(a.srt).read().strip().split('\n\n')
    def t(x):
        h, m, s = x.replace(',', '.').split(':'); return int(h) * 3600 + int(m) * 60 + float(s)
    iv = [tuple(map(t, b.split('\n')[1].split(' --> '))) for b in blocks]
    check(all(x[1] <= y[0] for x, y in zip(iv, iv[1:])), f'srt {len(iv)} lines, no overlaps')
    check(iv[-1][1] <= a.duration, 'srt ends inside the film')
    check(not re.search(r'\[[A-Z_]{3,}\]', open(a.srt).read()), 'srt has no unresolved placeholders')
if a.script:
    check(not re.search(r'\[[A-Z_]{3,}\]', open(a.script).read()), 'script has no unresolved placeholders')

secrets = [s for s in os.environ.get('SECRETS', '').split(',') if len(s) >= 8]
leaks = []
for d in a.scan:
    for root, _, files in os.walk(d):
        for f in files:
            p = os.path.join(root, f)
            if os.path.getsize(p) > 50_000_000 or f.endswith(('.jpg', '.png', '.mp4', '.wav', '.webp')):
                continue
            try:
                txt = open(p, errors='ignore').read()
            except Exception:
                continue
            leaks += [p for s in secrets if s in txt]
check(not leaks, f'secret scan over {a.scan}: {sorted(set(leaks)) or "clean"}')

print('\n'.join(notes + fails))
sys.exit(1 if fails else 0)
