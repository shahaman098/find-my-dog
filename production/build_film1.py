"""Build Film 1's timeline data (production/film1/data.js) from the real capture + locked narration.

    python3 production/build_film1.py <take_dir>     # e.g. production/out/12_raw_evidence/take_01

Inputs: <take_dir>/events.json, network.har, screen_take.mp4, still_*.png; voice word timings;
terminal recordings. Every footage frame shown in the film maps to a real frame of screen_take.mp4.
Live-action scenes use piecewise-linear time maps whose anchors are real events pinned to the narration
word that describes them, so speed-ups never put an action under the wrong words.
"""
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAKE = os.path.abspath(sys.argv[1])
OUT = os.path.join(ROOT, 'production', 'film1')
FR = os.path.join(TAKE, 'take_frames')
VOICE = os.path.join(ROOT, 'production', 'out', 'voice', '01_hackathon_demo_120s')
TERM = os.path.join(ROOT, 'production', 'out', '12_raw_evidence', 'terminal')
os.makedirs(OUT, exist_ok=True)

script = json.load(open(os.path.join(ROOT, 'production', 'scripts', 'film1.json')))
ev = json.load(open(os.path.join(TAKE, 'events.json')))
E = {}
for e in ev['events']:
    E.setdefault(e['name'], e['t'])          # first occurrence
rec0 = E['screen_recording_started']
V = lambda name, d=0.0: round(E[name] - rec0 + d, 3)  # event -> seconds into screen_take.mp4
take_dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', os.path.join(TAKE, 'screen_take.mp4')]))

# ---- frames of the take (30 fps), extracted once
if not os.path.isdir(FR) or len(os.listdir(FR)) < take_dur * 29:
    os.makedirs(FR, exist_ok=True)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', os.path.join(TAKE, 'screen_take.mp4'), '-q:v', '3', os.path.join(FR, '%06d.jpg')], check=True)
nframes = len(os.listdir(FR))

# ---- raw neighbour clips (blurred) for the hook
RAWC = os.path.join(ROOT, 'production', 'work', 'rawclip_frames')
for name, src in [('fountain', 'production/work/fountain_10fps.mp4'), ('doorbell', 'production/work/doorcam_blurred.mp4')]:
    d = os.path.join(RAWC, name)
    if not os.path.isdir(d):
        os.makedirs(d)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', os.path.join(ROOT, src), '-q:v', '3', os.path.join(d, '%05d.jpg')], check=True)

# ---- voice: scene placement + words
LEAD = 0.35
voice, captions = [], []
for sc in script['scenes']:
    w = json.load(open(os.path.join(VOICE, f"{sc['id']}.words.json")))
    at = sc['start'] + (0.5 if sc['id'] == '01_hook' else LEAD)
    voice.append({'scene': sc['id'], 'file': os.path.join(VOICE, f"{sc['id']}.wav"), 'at': at, 'duration': w['duration']})
    words = [{'w': x['word'], 's': round(at + x['start'], 3), 'e': round(at + x['end'], 3)} for x in w['words']]
    # caption lines: <= 44 chars, break at sentence ends
    line, start = [], None
    for i, x in enumerate(words):
        if not line: start = x['s']
        line.append(x)
        text = ' '.join(y['w'] for y in line)
        nxt = words[i + 1]['w'] if i + 1 < len(words) else None
        if len(text) > 38 or x['w'][-1] in '.?!:' or nxt is None or len(text + ' ' + (nxt or '')) > 44:
            captions.append({'s': start, 'e': x['e'] + 0.12, 'text': text, 'words': line})
            line = []
    sc['words'] = words
# no overlapping caption lines: each ends just before the next begins
for a_, b_ in zip(captions, captions[1:]):
    a_['e'] = round(min(a_['e'], b_['s'] - 0.02), 3)

def word_time(scene_id, word_prefix, nth=0):
    hits = [x for x in next(s for s in script['scenes'] if s['id'] == scene_id)['words'] if x['w'].lower().startswith(word_prefix.lower())]
    return hits[nth]['s']

def tmap(anchors):
    """anchors: list of (film_t, take_t), increasing in both -> piecewise-linear map.
    Never slower than real time: if a take span is shorter than its film span, hold the earlier frame and then
    play at 1x so the anchored event still lands exactly on its word (no slow motion, no reordering)."""
    out = [list(anchors[0])]
    for (a1, b1), (a2, b2) in zip(anchors, anchors[1:]):
        if b2 - b1 < a2 - a1:
            out.append([a2 - (b2 - b1), b1])   # hold b1 ...
        out.append([a2, b2])                   # ... then real time into the anchor
    return [[round(a, 3), round(b, 3)] for a, b in out]

S = {s['id']: s for s in script['scenes']}
# ---- HAR: real requests (owner token redacted)
har = json.load(open(os.path.join(TAKE, 'network.har')))['log']['entries']
rid = ev['report_id']
req = []
first_wall = None
for h in har:
    u = h['request']['url']
    if '/api/' not in u:
        continue
    path = re.sub(r'https?://[^/]+', '', u)
    if re.search(r'/(stills|pet_photo|poster)(/|$)', path) and h['request']['method'] == 'GET':
        continue
    hdr = {x['name'].lower(): x['value'] for x in h['response'].get('headers', [])}
    body = (h['response'].get('content') or {}).get('text') or ''
    try:
        j = json.loads(body)
    except Exception:
        j = None
    from datetime import datetime
    wall = datetime.fromisoformat(h['startedDateTime'].replace('Z', '+00:00')).timestamp()
    req.append({'wall': wall, 'method': h['request']['method'], 'path': path, 'status': h['response']['status'], 'ms': round(h['time']),
                'ray': hdr.get('cf-ray'), 'json': j})
t0_wall = datetime.fromisoformat(ev['t0'].replace('Z', '+00:00')).timestamp()
for r in req:
    r['take_t'] = round(r['wall'] - t0_wall - rec0, 3)

def excerpt(j, keys):
    if not isinstance(j, dict): return None
    return {k: j[k] for k in keys if k in j}

polls = []  # clip status transitions observed by the UI's polling
last = {}
for r in req:
    if r['method'] == 'GET' and re.fullmatch(rf'/api/reports/{rid}', r['path']) and isinstance(r['json'], dict):
        for c in r['json'].get('clips', []):
            key = c['label']
            if last.get(key) != c['status']:
                last[key] = c['status']
                polls.append({'take_t': r['take_t'], 'clip': key, 'status': c['status'], 'tracks': c.get('n_tracks'), 'ray': r['ray']})

match_req = next((r for r in req if r['method'] == 'POST' and r['path'].endswith('/match')), None)
analyze_req = next((r for r in req if r['method'] == 'POST' and r['path'].endswith('/analyze')), None)
timeline_req = [r for r in req if r['method'] == 'GET' and r['path'].endswith('/timeline')]
clip_posts = [r for r in req if r['method'] == 'POST' and r['path'].endswith('/clips')]
report_post = next((r for r in req if r['method'] == 'POST' and r['path'] == '/api/reports'), None)

def match_view(j):
    if not isinstance(j, dict): return None
    ms = sorted(j.get('matches', []), key=lambda m: -(m['score'] if m['is_match'] else 0))
    return {'matcher_model': j.get('matcher_model'), 'matches': [{k: m[k] for k in ['clip_id', 'object_id', 'is_match', 'score']} | {'rationale': m['rationale'][:90] + '…'} for m in ms[:3]]}

network = {
    'report': report_post and {k: report_post[k] for k in ['method', 'path', 'status', 'ms', 'ray', 'take_t']},
    'clips': [{k: r[k] for k in ['method', 'path', 'status', 'ms', 'ray', 'take_t']} for r in clip_posts],
    'polls': polls,
    'match': match_req and ({k: match_req[k] for k in ['method', 'path', 'status', 'ms', 'ray', 'take_t']} | {'view': match_view(match_req['json'])}),
    'analyze': analyze_req and ({k: analyze_req[k] for k in ['method', 'path', 'status', 'ms', 'ray', 'take_t']} | {'view': excerpt(analyze_req['json'], ['calls', 'poster'])}),
    'timeline_after_reload': timeline_req and ({k: timeline_req[-1][k] for k in ['method', 'path', 'status', 'ms', 'ray', 'take_t']} |
                                               {'view': {'sightings': len((timeline_req[-1]['json'] or {}).get('sightings', [])), 'next_search': ((timeline_req[-1]['json'] or {}).get('next_search') or {}).get('headline'), 'poster': (timeline_req[-1]['json'] or {}).get('poster')}}),
}

# ---- live-action time maps (film t -> take t), anchored on real events at the words that describe them
s5 = S['05_live_action']; s7 = S['07_result']
live = tmap([
    (s5['start'], V('typed_name', -2.5)),
    (word_time('05_live_action', 'photo'), V('photo_attached', -0.3)),
    (word_time('05_live_action', 'upload'), V('clips_selected', -0.6)),
    (word_time('05_live_action', 'SAM'), V('clocks_set', 0.5)),
    (s5['end'], V('tracking_done', 2.0)),
])
result = tmap([
    (s7['start'], V('matches_visible', 1.0)),
    (word_time('07_result', 'confirm'), V('confirmed_top', -0.4)),
    (word_time('07_result', 'tool'), V('analyze_clicked', -0.3)),
    (word_time('07_result', 'poster'), V('poster_visible', 0.4)),
    (word_time('07_result', 'Reloading'), V('share_reloaded', -0.8)),
    (s7['end'], V('share_reloaded', 3.5)),
])
process_ = tmap([(S['06_process']['start'], V('match_clicked', -1.5)), (S['06_process']['end'], V('matches_visible', 1.0))])

def clamp_map(m):
    return [[a, max(0.0, min(take_dur - 0.05, b))] for a, b in m]

term = {k: json.load(open(os.path.join(TERM, f'{k}.json'))) for k in ['npm_test', 'e2e_mock', 'access_prod'] if os.path.exists(os.path.join(TERM, f'{k}.json'))}

data = {
    'fps': 30, 'duration': script['duration'], 'scenes': [{k: s[k] for k in ['id', 'start', 'end', 'text']} for s in script['scenes']],
    'words': {s['id']: s['words'] for s in script['scenes']}, 'captions': captions,
    'take': {'dir': os.path.relpath(FR, OUT), 'frames': nframes, 'fps': 30, 'duration': take_dur, 'base': ev['base'], 'report_id': rid,
             'events': {k: V(k) for k in E if k not in ('api', 'still', 'dialog')}},
    'maps': {'live': clamp_map(live), 'result': clamp_map(result), 'process': clamp_map(process_),
             'hook_reverse': clamp_map([[2.0, V('share_reloaded', 2.5)], [3.6, V('clips_selected', 0)]]),
             'clean': clamp_map([[S['04_clean_state']['start'], V('health_page', 0.3)], [S['04_clean_state']['start'] + 3.2, V('landing', 0.2)], [S['04_clean_state']['end'], V('typed_name', -2.5)]]),
             'reveal_still': V('landing', 4.0)},
    'raw': {'fountain': {'dir': os.path.relpath(os.path.join(RAWC, 'fountain'), OUT), 'n': len(os.listdir(os.path.join(RAWC, 'fountain'))), 'fps': 10},
            'doorbell': {'dir': os.path.relpath(os.path.join(RAWC, 'doorbell'), OUT), 'n': len(os.listdir(os.path.join(RAWC, 'doorbell'))), 'fps': 10}},
    'stills': {n[6:-4]: os.path.relpath(os.path.join(TAKE, n), OUT) for n in os.listdir(TAKE) if n.startswith('still_')},
    'network': network, 'terminal': term,
    'strength_chart': os.path.relpath(os.path.join(ROOT, 'evidence', 'img', 'chart-strength.png'), OUT),
    'arch_svg': open(os.path.join(ROOT, 'production', '08_architecture_diagram.svg')).read(),
    'voice': voice,
}
open(os.path.join(OUT, 'data.js'), 'w').write('window.DATA = ' + json.dumps(data) + ';\n')
json.dump({'voice': voice, 'captions': captions}, open(os.path.join(OUT, 'audio_plan.json'), 'w'), indent=1)
print('take', round(take_dur, 1), 's, frames', nframes, '| report', rid, '| captions', len(captions), '| requests', len(req), '| polls', len(polls))
for k, m in data['maps'].items():
    if isinstance(m, list):
        sp = [round((b2 - b1) / max(a2 - a1, 1e-6), 2) for (a1, b1), (a2, b2) in zip(m, m[1:])]
        print(f'  map {k:13} speeds {sp}')
