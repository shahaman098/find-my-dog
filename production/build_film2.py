"""Build Film 2's timeline data (production/film2/data.js): terminal recordings, real source excerpts at HEAD,
the full take (time-compressed, labelled), HAR + Worker log evidence, word-timed captions.

    python3 production/build_film2.py production/out/12_raw_evidence/take_01
"""
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAKE = os.path.abspath(sys.argv[1])
OUT = os.path.join(ROOT, 'production', 'film2')
VOICE = os.path.join(ROOT, 'production', 'out', 'voice', '02_engineering_evidence_240s')
TERM = os.path.join(ROOT, 'production', 'out', '12_raw_evidence', 'terminal')
os.makedirs(OUT, exist_ok=True)
script = json.load(open(os.path.join(ROOT, 'production', 'scripts', 'film2.json')))
f1 = json.loads(open(os.path.join(ROOT, 'production', 'film1', 'data.js')).read()[len('window.DATA = '):].rstrip().rstrip(';'))
rev = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT).decode().strip()

LEAD = 0.5
voice, captions = [], []
for sc in script['scenes']:
    w = json.load(open(os.path.join(VOICE, f"{sc['id']}.words.json")))
    at = sc['start'] + LEAD
    voice.append({'scene': sc['id'], 'file': os.path.join(VOICE, f"{sc['id']}.wav"), 'at': at, 'duration': w['duration']})
    words = [{'w': x['word'], 's': round(at + x['start'], 3), 'e': round(at + x['end'], 3)} for x in w['words']]
    line, start = [], None
    for i, x in enumerate(words):
        if not line: start = x['s']
        line.append(x)
        text = ' '.join(y['w'] for y in line)
        nxt = words[i + 1]['w'] if i + 1 < len(words) else None
        if len(text) > 38 or x['w'][-1] in '.?!:' or nxt is None or len(text + ' ' + (nxt or '')) > 44:
            captions.append({'s': start, 'e': x['e'] + 0.12, 'text': text, 'words': line}); line = []
    sc['words'] = words
for a_, b_ in zip(captions, captions[1:]):
    a_['e'] = round(min(a_['e'], b_['s'] - 0.02), 3)

def code(path, start_pat, n, hl_pats=()):
    lines = open(os.path.join(ROOT, path)).read().split('\n')
    i = next(k for k, l in enumerate(lines) if re.search(start_pat, l))
    seg = lines[i:i + n]
    return {'path': path, 'first': i + 1, 'lines': seg, 'hl': [k for k, l in enumerate(seg) if any(re.search(p, l) for p in hl_pats)]}

codes = {
    'consumer': code('worker/src/index.ts', r'Public deployments pass the clip URL', 14, [r'uploadVideo', r'trackVideo\(env, video', r'isPublicUrl']),
    'track': code('worker/src/meta.ts', r'Stream SAM 3\.1 over a video', 20, [r"model: 'sam-3\.1'", r'input_video', r'parseSegmentation']),
    'match': code('worker/src/index.ts', r"app\.post\('/api/reports/:id/match'", 12, [r'ownerOnly', r'candidates\.push']),
    'prompt': code('worker/src/prompts.ts', r'export function matchPrompt', 16, [r'Judge by robust appearance', r'is_match=false']),
    'owner': code('worker/src/index.ts', r'const ownerOnly = createMiddleware', 13, [r'ownerTokenMatches', r'403']),
}
term = {n[:-5]: json.load(open(os.path.join(TERM, n))) for n in os.listdir(TERM) if n.endswith('.json')}
ev = json.load(open(os.path.join(TAKE, 'events.json')))
E = {}
for e in ev['events']:
    E.setdefault(e['name'], e['t'])
rec0 = E['screen_recording_started']
steps = [(round(E[k] - rec0, 2), label) for k, label in [('health_page', 'health check'), ('landing', 'landing page'), ('typed_name', 'typing the report'),
         ('submit_report', 'report filed'), ('clips_selected', 'two clips uploaded'), ('clocks_set', 'recording times set'), ('tracking_done', 'SAM 3.1 tracking done'),
         ('match_clicked', 'Muse Spark matching'), ('matches_visible', 'ranked matches'), ('confirmed_top', 'owner confirms'), ('analyze_clicked', 'Spark tool loop'),
         ('poster_visible', 'plan + Muse Image poster'), ('share_opened', 'share page'), ('share_reloaded', 'reload: stored state')] if k in E]
take = f1['take']
s3 = next(s for s in script['scenes'] if s['id'] == '03_end_to_end')
data = {
    'fps': 30, 'duration': script['duration'], 'rev': rev, 'scenes': [{k: s[k] for k in ['id', 'start', 'end', 'text']} for s in script['scenes']],
    'words': {s['id']: s['words'] for s in script['scenes']}, 'captions': captions, 'codes': codes, 'terminal': term,
    'take': {**take, 'dir': os.path.relpath(os.path.join(TAKE, 'take_frames'), OUT)},
    'e2e_map': [[s3['start'] + 0.5, 0.0], [s3['end'] - 0.5, take['duration'] - 0.1]], 'steps': steps,
    'network': f1['network'],
    'stills': {k: os.path.relpath(os.path.join(ROOT, 'production', 'film1', v), OUT) for k, v in f1['stills'].items()},
    'charts': {k: os.path.relpath(os.path.join(ROOT, 'evidence', 'img', f'chart-{k}.png'), OUT) for k in ['strength', 'robustness', 'sam-occlusion', 'headline']},
    'limits': [
        'Small n: 3 dogs, 87 comparisons, one doorbell clip; robustness is 1 trial per simulated condition.',
        'Reference photos are frames from the same footage: easier than a real owner photo.',
        'SAM 3.1 re-identification fails across hard video cuts (9 of 16 montage tracks); track spans can leak into the plan.',
        '83% matcher precision: the owner-confirm step is load-bearing; the product never auto-confirms.',
        'This recording ran on a local Worker (same commit, live Meta API); the public deploy was not available in time.',
        'Third-party dependencies: Meta Model API (SAM 3.1, Muse Spark, Muse Image, Voice Transcribe), Cloudflare Workers/D1/R2/Queues.',
        'Unfinished: Muse Glimmer path not enabled; voice-note transcription not exercised in this take.',
    ],
    'voice': voice,
}
open(os.path.join(OUT, 'data.js'), 'w').write('window.DATA = ' + json.dumps(data) + ';\n')
json.dump({'voice': voice, 'captions': captions}, open(os.path.join(OUT, 'audio_plan.json'), 'w'), indent=1)
print('film2 data:', len(captions), 'captions,', len(term), 'terminal recordings,', len(steps), 'take steps, rev', rev)
