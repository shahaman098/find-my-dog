"""Generate the written deliverables from the same data the films are built from.

    python3 production/docs.py
Writes production/10_script_and_timeline.md, production/09_evidence_manifest.md,
production/out/12_raw_evidence/INDEX.md. Run after build_film1.py.
"""
import hashlib, json, os, re, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
data = json.loads(open(P('production', 'film1', 'data.js')).read()[len('window.DATA = '):].rstrip().rstrip(';'))
s1 = json.load(open(P('production', 'scripts', 'film1.json')))
s2 = json.load(open(P('production', 'scripts', 'film2.json'))) if os.path.exists(P('production', 'scripts', 'film2.json')) else None
take_dir = P('production', 'out', '12_raw_evidence', 'take_01')
ev = json.load(open(os.path.join(take_dir, 'events.json')))
final = json.load(open(os.path.join(take_dir, 'final_state.json')))
rev = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT).decode().strip()
mmss = lambda x: f'{int(x // 60)}:{x % 60:05.2f}'

def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()[:16]

# ---------- 10 script and timeline ----------
maps = data['maps']
scene_vis = {
    '01_hook': 'Final share page from the take (push-in) → reverse playback of the same take → the two blurred input clips → before/after split.',
    '02_problem': 'Typographic illustration (labelled "illustration"): three manual steps, Ring vs a real street, ASPCA 2012 statistic with source.',
    '03_reveal': 'Logo, then a still of the landing page from the take, with the recorded URL badge.',
    '04_clean_state': 'Take frames from the health page to the empty form; health-check panel; "what this proves" panel.',
    '05_live_action': 'One continuous take, piecewise time map anchored on real events; on-screen speed + real elapsed time.',
    '06_process': 'Same take beside the HAR request log of the take; rows light at their recorded times; Spark response excerpt.',
    '07_result': 'Same take: ranked matches → confirm → plan + poster → share page reload; stored-state panel from the HAR.',
    '08_architecture': 'Architecture SVG (08_architecture_diagram.svg); nodes highlight on the words naming them.',
    '09_tests': 'Recorded terminal sessions replayed at recorded speed (unit tests, mock E2E) + benchmark chart.',
    '10_edge_case': 'Stranger view (no owner token) still + recorded terminal session of the 403s (production/edge_case.sh).',
    '11_close': 'Logo, tagline, repo / EVIDENCE.md / app URL.',
}
scene_map = {'04_clean_state': 'clean', '05_live_action': 'live', '06_process': 'process', '07_result': 'result'}
L = [f'# Script and timeline: Film 1 "The Proof" (120 s)\n',
     f'Locked narration (`production/scripts/film1.json`), voiced with ElevenLabs voice `dxT8yYZS41hHdsvjw7XV` (eleven_multilingual_v2; stability 0.65, similarity 0.90, style 0, speed 0.88; 48 kHz). '
     f'Every time below is generated from the voice word timings and the capture event log. Source revision `{rev}`; take `{os.path.relpath(take_dir, ROOT)}` against `{ev["base"]}`.\n',
     '**Lock history:** scene 04 originally said "on the deployed site". The production deploy was not available in time, so the take was recorded on a local Worker running the same commit against the live Meta API, and the line was re-locked to say exactly that. **v3:** v2 narration ran at ~196 words/min and sounded rushed. It was re-voiced at speed 0.88 (~170 words/min) with higher similarity and no style exaggeration, and scenes 01, 02, 03, 04, 08, 10 and 11 were trimmed to fit their windows; every word a visual is cued on was kept. "running live" was dropped from scene 03 because the take is a recording.\n']
for sc in s1['scenes']:
    words = data['words'][sc['id']]
    L.append(f"\n## {sc['id']} · {mmss(sc['start'])}–{mmss(sc['end'])}\n")
    L.append(f"**Narration** ({words[0]['s']:.2f}–{words[-1]['e']:.2f} s): {sc['text']}\n")
    L.append(f"**Visual / evidence:** {scene_vis[sc['id']]}\n")
    m = maps.get(scene_map.get(sc['id'], ''), None)
    if m:
        segs = []
        for (a1, b1), (a2, b2) in zip(m, m[1:]):
            sp = (b2 - b1) / max(a2 - a1, 1e-6)
            segs.append(f'film {a1:.2f}–{a2:.2f} s ← take {b1:.2f}–{b2:.2f} s ({"hold" if sp < 0.05 else f"{sp:.2f}×"})')
        L.append('**Time map (no cuts):** ' + '; '.join(segs) + '\n')
L.append('\n## Take events (seconds into `screen_take.mp4`)\n\n| event | t |\n|---|---|\n' + ''.join(f'| {k} | {v:.2f} |\n' for k, v in sorted(data['take']['events'].items(), key=lambda kv: kv[1])))
L.append('\n## Captions\n\nBurned in from the same word timings, and exported as `06_demo_subtitles.srt` (no overlapping lines; QA-checked).\n')
if s2:
    L.append('\n# Film 2 "Engineering Evidence" (240 s): locked narration\n\nThe master prompt\'s locked narration, verbatim. The only placeholder pair was filled from EVIDENCE.md §8: '
             '`[REAL_DESIGN_DECISION]` → "owner-confirmed matching", `[VERIFIED_REASON]` → "the matcher is eighty-three percent precise, so its verdict alone is not enough, and a person makes the final call".\n')
    for sc in s2['scenes']:
        L.append(f"\n**{sc['id']} · {mmss(sc['start'])}–{mmss(sc['end'])}:** {sc['text']}\n")
s3p = P('production', 'scripts', 'film3.json')
if os.path.exists(s3p):
    s3 = json.load(open(s3p))
    L.append('\n# Film 3 "The Impossible Made Simple" (60 s, 24 fps): locked narration\n\nTemplate placeholders filled from verified facts. '
             'Two template lines were adapted, openly: ' + ' '.join(f"**{k}:** {v}" for k, v in s3.get('adaptations', {}).items()) + '\n')
    for sc in s3['scenes']:
        L.append(f"\n**{sc['id']} · {mmss(sc['start'])}–{mmss(sc['end'])}:** {sc['text'] or '[silence]'}\n")
    L.append('\nVisual sources: Muse Image concept stills (production/concept_images.mjs, prompts saved beside each image), marked "concept imagery" on screen; '
             'real product footage from take_01 (marked "real product footage · time-compressed"); the engine sequence animates only components in 08_architecture_diagram.svg; '
             'the result card is the take\'s own 4K still of the ranked matches.\n')
open(P('production', '10_script_and_timeline.md'), 'w').write(''.join(L))

# ---------- 09 evidence manifest ----------
top = sorted(final['matches'], key=lambda m: -(m['score'] if m['is_match'] else 0))[0]
N = data['network']
rows = [
    ('The app runs on real models, not mock mode', 'health check in the take', f"take events `deploy_verified` → health `{json.dumps(ev['events'][0].get('health'))}`"),
    ('A brand-new report is created during the take', 'take event `report_created`', f"report `{data['take']['report_id']}` at take t={data['take']['events'].get('report_created', 0):.1f} s"),
    ('SAM 3.1 tracks every animal in each clip', 'HAR polling of the take', '; '.join(f"t={p['take_t']:.1f}s {p['clip']} {p['status']}" + (f" ({p['tracks']} tracks)" if p['status'] == 'done' else '') for p in N['polls'])),
    ('People in the footage are blurred', 'production/blur_people.py', 'SAM 3.1 `person` + `license plate` tracks → per-frame pixelation; 5 people + 2 plates found in the doorbell clip, 0 people in the dog-park shot'),
    ('Muse Spark compares every animal with the owner photo', 'HAR: POST …/match', f"status {N['match']['status']}, {N['match']['ms']} ms, matcher `{(N['match']['view'] or {}).get('matcher_model')}`"),
    ('Biscuit ranks first', 'final_state.json', f"top: clip `{top['clip_id']}` object {top['object_id']} is_match={top['is_match']} score={top['score']}"),
    ('The owner confirms; the model never does', 'final_state.json + worker/src/index.ts `ownerOnly`', f"confirmed: {[(m['object_id'], m['confirmed']) for m in final['matches'] if m['confirmed'] is not None]}"),
    ('Spark\'s tool loop writes a plan and calls Muse Image', 'HAR: POST …/analyze', f"status {N['analyze']['status'] if N['analyze'] else '—'}; tool calls {((N['analyze'] or {}).get('view') or {}).get('calls')}; plan: \"{(final.get('next_search') or {}).get('headline')}\""),
    ('Reloading proves the result is stored', 'HAR: GET …/timeline after reload', json.dumps((N['timeline_after_reload'] or {}).get('view'))),
    ('A stranger cannot change the decision (403)', 'terminal/access_prod.json', 'POST confirm with a guessed token → 403; POST analyze on the demo report → 403; decision unchanged'),
    ('Unit tests and E2E pass', 'terminal/npm_test.json, terminal/e2e_mock.json', f"exit codes {data['terminal'].get('npm_test', {}).get('exit_code')} / {data['terminal'].get('e2e_mock', {}).get('exit_code')}"),
    ('Right dog ranked first 9/9; 92% accuracy over 87 comparisons', 'eval/results/match.json', 'EVIDENCE.md §1 (production code path, live Meta API)'),
    ('Same SAM ID through a 1.5 s blackout', 'eval/results/doorcam_occluded.tracks.json', 'EVIDENCE.md §2'),
    ('18/18 top-ranked under simulated doorbell conditions', 'eval/results/robust_*.json', 'EVIDENCE.md §1b'),
    ('Architecture as drawn', 'production/08_architecture_diagram.svg', 'bindings from wrangler.jsonc (ASSETS, DB, MEDIA, PIPELINE); endpoints from worker/src/meta.ts'),
    ('49% of found dogs were found by searching the neighbourhood', 'ASPCA press release (2012)', 'https://www.aspca.org/about-us/press-releases/how-many-pets-are-lost-how-many-find-their-way-home-aspca-survey-has-answers'),
    ('Ring Search Party scans Ring cameras', 'Amazon announcement', 'https://www.aboutamazon.com/news/devices/ring-search-party-for-dogs-united-states-missing-pets'),
]
M = [f'# Evidence manifest (claim → evidence)\n\nRevision `{rev}`. Take: `{os.path.relpath(take_dir, ROOT)}` (one continuous recording, unedited; Film 1 time-compresses it with on-screen speed and never cuts it).\n\n'
     '| # | Claim in the films | Evidence | Detail |\n|---|---|---|---|\n']
M += [f'| {i} | {c} | {e} | {d} |\n' for i, (c, e, d) in enumerate(rows, 1)]
M.append('\n## Disclosures\n\n'
         '- **Recording environment:** local Worker (`wrangler dev`, real mode) running this commit against the live Meta API, because the production deploy was not available in time. SAM receives clips via the Meta Files API in this environment (worker/src/meta.ts `uploadVideo`, used when the clip URL is not public).\n'
         '- **Pointer:** headless automation does not move the OS cursor, so a small on-page ring follows the real input events (production/capture_prod.cjs `POINTER`).\n'
         '- **Footage licence:** both clips are Internet Archive items with no stated licence; every person and number plate is pixelated.\n'
         '- **Reference photo:** a crop from the same dog-park footage (easier than a real owner photo; see EVIDENCE.md §8).\n'
         '- **Terminal panels:** recorded sessions (production/term_record.cjs) replayed at recorded speed; commands are printed exactly as executed.\n'
         '- **Music:** original procedural score (production/score.py); no third-party audio.\n'
         '- **Generated imagery:** the poster is generated by Muse Image inside the product. Film 3 uses Muse Image concept stills, each marked "concept imagery".\n')
open(P('production', '09_evidence_manifest.md'), 'w').write(''.join(M))

# ---------- 12 raw evidence index ----------
R = [f'# Raw evidence index\n\nRevision `{rev}`. All files are the original, unedited outputs.\n\n| file | what | sha256 (first 16) |\n|---|---|---|\n']
for root, _, files in os.walk(P('production', 'out', '12_raw_evidence')):
    if 'take_frames' in root or root.endswith('/frames'):
        continue
    for f in sorted(files):
        p = os.path.join(root, f)
        if f == 'INDEX.md':
            continue
        what = {'screen_take.mp4': 'continuous 4K 30 fps screen recording of the whole take', 'network.har': 'every HTTP request of the take (owner token present: do not publish raw)',
                'events.json': 'wall-clock event log of every action and state change', 'final_state.json': 'report state after the take', 'capture.log': 'console log of the capture'}.get(f, 'still' if f.startswith('still_') else 'terminal recording' if f.endswith('.json') else '')
        R.append(f'| `{os.path.relpath(p, P("production", "out", "12_raw_evidence"))}` | {what} | `{sha(p)}` |\n')
R.append('\n**Timestamps:** `events.json` lists every event in seconds since capture start; `screen_take.mp4` t=0 is event `screen_recording_started`. `production/10_script_and_timeline.md` maps every film second to take seconds.\n')
open(P('production', 'out', '12_raw_evidence', 'INDEX.md'), 'w').write(''.join(R))
print('wrote 10_script_and_timeline.md, 09_evidence_manifest.md, 12_raw_evidence/INDEX.md')
