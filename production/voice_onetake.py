"""Record a film's whole narration as ONE ElevenLabs take, then cut it into per-scene clips.

    python3 production/voice_onetake.py production/scripts/film1.json

One request = one consistent performance (eleven_v3 generates each request independently, so per-scene
requests drift in tone). Writes the same files as voice.mjs: production/out/voice/<film>/<scene>.wav,
<scene>.words.json and timing_report.json. Key from ELEVENLABS_API_KEY or .env; never printed.
Settings via EL_MODEL / EL_STABILITY / EL_SIMILARITY / EL_STYLE / EL_SPEED (defaults: eleven_v3, 0.5, 0.75, 0, 1.0).
"""
import base64, json, os, re, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
KEY = os.environ.get('ELEVENLABS_API_KEY') or next((l.split('=', 1)[1].strip() for l in open('.env') if l.startswith('ELEVENLABS_API_KEY=')), '')
if not KEY:
    sys.exit('ELEVENLABS_API_KEY missing')
VOICE = 'dxT8yYZS41hHdsvjw7XV'
MODEL = os.environ.get('EL_MODEL', 'eleven_v3')
env = lambda k, d: float(os.environ.get(k, d))
SETTINGS = {'stability': env('EL_STABILITY', 0.5), 'similarity_boost': env('EL_SIMILARITY', 0.75), 'style': env('EL_STYLE', 0),
            'use_speaker_boost': True, 'speed': env('EL_SPEED', 1.0)}
SAY = [(r'SAM 3\.1', 'SAM three point one'), (r'\bD1\b', 'D one'), (r'\bR2\b', 'R two'), (r'\b403\b', 'four oh three')]
spoken = lambda t: re.sub(r'\s+', ' ', __import__('functools').reduce(lambda s, p: re.sub(p[0], p[1], s), SAY, t))
SR = 48000

script = json.load(open(sys.argv[1]))
out = os.path.join('production', 'out', 'voice', script['film'])
os.makedirs(out, exist_ok=True)
SEP = '\n\n'
parts = [spoken(s['text']) for s in script['scenes']]
full = SEP.join(parts)
bounds, i = [], 0
for p in parts:
    bounds.append((i, i + len(p))); i += len(p) + len(SEP)

req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=pcm_48000',
                             data=json.dumps({'text': full, 'model_id': MODEL, 'voice_settings': SETTINGS}).encode(),
                             headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
try:
    j = json.load(urllib.request.urlopen(req, timeout=300))
except urllib.error.HTTPError as e:
    sys.exit(f'elevenlabs {e.code}: {e.read()[:300]!r}')
pcm = base64.b64decode(j['audio_base64'])
al = j['alignment']
chars, st, en = al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']
if ''.join(chars) != full:
    sys.exit('alignment text differs from request text; cannot cut scenes safely')
open(os.path.join(out, '_onetake.pcm'), 'wb').write(pcm)
total = len(pcm) / 2 / SR

report = []
for k, (sc, (a, b)) in enumerate(zip(script['scenes'], bounds)):
    t0 = max(0.0, st[a] - 0.06)
    t1 = en[b - 1] + 0.18
    if k + 1 < len(bounds):
        t1 = min(t1, st[bounds[k + 1][0]] - 0.04)
    t1 = min(t1, total)
    seg = pcm[int(t0 * SR) * 2:int(t1 * SR) * 2]
    wav = os.path.join(out, f"{sc['id']}.wav")
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-af', 'afade=t=in:d=0.02,areverse,afade=t=in:d=0.04,areverse', '-c:a', 'pcm_s24le', wav], input=seg, check=True)
    dur = len(seg) / 2 / SR
    # spoken words of this scene from the character alignment
    sw, cur = [], None
    for c in range(a, b):
        if chars[c].isspace():
            if cur: sw.append(cur); cur = None
            continue
        if not cur: cur = {'start': st[c] - t0, 'end': en[c] - t0}
        cur['end'] = en[c] - t0
    if cur: sw.append(cur)
    words, si = [], 0
    for wt in sc['text'].split():
        n = len(spoken(wt).split()) or 1
        g = sw[si:si + n]; si += n
        if g: words.append({'word': wt, 'start': round(g[0]['start'], 3), 'end': round(g[-1]['end'], 3)})
    if len(words) != len(sc['text'].split()):
        sys.exit(f"{sc['id']}: mapped {len(words)} of {len(sc['text'].split())} words")
    json.dump({'scene': sc['id'], 'text': sc['text'], 'spoken': spoken(sc['text']), 'duration': round(dur, 3), 'format': 'pcm_48000',
               'model': MODEL, 'settings': SETTINGS, 'onetake': {'from': round(t0, 3), 'to': round(t1, 3)}, 'words': words},
              open(os.path.join(out, f"{sc['id']}.words.json"), 'w'), indent=1)
    win = sc['end'] - sc['start']
    report.append({'scene': sc['id'], 'window': win, 'duration': round(dur, 2), 'slack': round(win - dur, 2),
                   'verdict': 'fits' if dur <= win - 0.3 else 'OVERRUN'})
    print(f"{sc['id']:16} {dur:6.2f}s / {win}s  {report[-1]['verdict']}")
json.dump({'format': 'pcm_48000', 'model': MODEL, 'settings': SETTINGS, 'onetake': True, 'report': report},
          open(os.path.join(out, 'timing_report.json'), 'w'), indent=1)
print(f'one take: {total:.1f} s')
