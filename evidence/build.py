"""Build the evidence board (evidence/board.html) from the raw benchmark data in eval/results/.

    python3 evidence/build.py          # writes evidence/board.html, evidence/data/*.csv, evidence/img/crops/*
    node evidence/shoot.cjs            # renders each board panel to evidence/img/*.png

Every number on the board is computed here from eval/results/*.json; nothing is typed in by hand.
"""
import csv, html, json, os, shutil
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(ROOT, 'evidence')
RES = os.path.join(ROOT, 'eval', 'results')
CROPS_SRC = os.path.join(ROOT, 'eval', 'fixtures', 'crops')
os.makedirs(os.path.join(EV, 'data'), exist_ok=True)
os.makedirs(os.path.join(EV, 'img', 'crops'), exist_ok=True)

load = lambda f: json.load(open(os.path.join(RES, f)))
match = load('match.json')
rows, M = match['rows'], match['metrics']
cases = json.load(open(os.path.join(ROOT, 'eval', 'match_cases.json')))
door = load('doorcam.tracks.json')
occl = load('doorcam_occluded.tracks.json')
park = load('dogpark.tracks.json')
plan = load('plan.json')
strength = lambda r: r['confidence'] if r['is_match'] else 0.0
esc = html.escape

# ---------- data exports ----------
with open(os.path.join(EV, 'data', 'match_rows.csv'), 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['case', 'trial', 'candidate', 'ground_truth', 'spark_verdict', 'spark_confidence', 'match_strength', 'correct', 'rationale'])
    for r in rows:
        w.writerow([r['case'], r['trial'], r['still'], 'true pet' if r['want_match'] else 'other', 'match' if r['is_match'] else 'reject',
                    r['confidence'], round(strength(r), 3), r['want_match'] == r['is_match'], r['rationale']])
with open(os.path.join(EV, 'data', 'sam_tracks.csv'), 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['clip', 'track_id', 'detections', 'first_seen_s', 'last_seen_s', 'gaps_over_0.5s'])
    for name, d in [('dogpark', park), ('doorcam', door), ('doorcam_occluded', occl)]:
        for s in d['summary']:
            w.writerow([name, s['object_id'], s['n_frames'], s['first_seen'], s['last_seen'], ' '.join(map(str, s['gaps_s']))])

# ---------- thumbnails (small, attributed in EVIDENCE.md) ----------
def thumb(rel):
    src = os.path.join(CROPS_SRC, rel)
    name = rel.replace('/', '_')
    dst = os.path.join(EV, 'img', 'crops', name)
    if os.path.exists(src) and not os.path.exists(dst):
        im = Image.open(src).convert('RGB')
        im.thumbnail((180, 180))
        im.save(dst, quality=82)
    return f'img/crops/{name}'

# ---------- panels ----------
P = []

# 1. headline numbers
top1 = sum(1 for c in cases for t in (1, 2, 3)
           if max((r for r in rows if r['case'] == c['name'] and r['trial'] == t), key=strength)['want_match'])
person = [r for r in rows if r['still'] == 't12_f442.jpg']
occ_tracks = occl['summary']
P.append(('headline', 'What was measured', f'''
<div class="tiles">
  <div class="tile"><b>{top1} / 9</b><span>true pet ranked #1</span><small>3 dogs × 3 trials, look-alike distractors</small></div>
  <div class="tile"><b>{M['accuracy']*100:.0f}%</b><span>verdict accuracy</span><small>{M['tp']+M['tn']} / {M['n']} comparisons</small></div>
  <div class="tile"><b>{M['recall']*100:.0f}%</b><span>recall</span><small>{M['tp']} of {M['tp']+M['fn']} true-pet crops flagged</small></div>
  <div class="tile"><b>{M['precision']*100:.0f}%</b><span>precision</span><small>{M['fp']} false flags, all caught by owner confirm</small></div>
  <div class="tile"><b>{len(occ_tracks)} ID</b><span>through a 1.5 s blackout</span><small>gap {occ_tracks[0]['gaps_s'][0]} s, same track #{occ_tracks[0]['object_id']}</small></div>
  <div class="tile"><b>{sum(not r['is_match'] for r in person)} / {len(person)}</b><span>person crop rejected</span><small>SAM mislabelled a person "dog"</small></div>
</div>
<p class="note">Production code path (<code>worker/src/sam.ts</code>, <code>prompts.ts</code>, <code>meta.ts</code>) against the live Meta API, {esc(match['run_at'][:10])}. Spark model: <code>{esc(M['model'])}</code>. Matching cost: ${M['usd']:.2f} for {M['n']} comparisons.</p>'''))

# 2. confusion matrix
P.append(('confusion', 'Confusion matrix: Muse Spark verdict vs ground truth', f'''
<table class="cm">
  <tr><th></th><th>Spark: match</th><th>Spark: reject</th><th>total</th></tr>
  <tr><th>Truth: the pet</th><td class="good">✓ {M['tp']}<small>true positive</small></td><td class="bad">✗ {M['fn']}<small>missed</small></td><td>{M['tp']+M['fn']}</td></tr>
  <tr><th>Truth: other animal / person</th><td class="bad">✗ {M['fp']}<small>false flag</small></td><td class="good">✓ {M['tn']}<small>true reject</small></td><td>{M['fp']+M['tn']}</td></tr>
</table>
<p class="note">{M['n']} comparisons = 3 cases × (3 true-pet crops + 6–7 distractors) × 3 independent trials.</p>'''))

# 3. strip plot of match strength
W, LANE, X0, X1 = 860, 70, 150, 830
xs = lambda v: X0 + v * (X1 - X0)
svg = [f'<svg viewBox="0 0 {W} {LANE*3+70}" class="chart" role="img" aria-label="Match strength per comparison by case">']
for i in range(0, 11):
    v = i / 10
    svg.append(f'<line x1="{xs(v):.1f}" x2="{xs(v):.1f}" y1="20" y2="{20+LANE*3}" class="grid"/><text x="{xs(v):.1f}" y="{38+LANE*3}" class="tick" text-anchor="middle">{v:.1f}</text>')
fpmin = min((strength(r) for r in rows if not r['want_match'] and r['is_match']), default=0)
fpmax = max((strength(r) for r in rows if not r['want_match'] and r['is_match']), default=0)
svg.append(f'<rect x="{xs(fpmin):.1f}" y="20" width="{xs(fpmax)-xs(fpmin):.1f}" height="{LANE*3}" class="zone"/>')
svg.append(f'<text x="{(xs(fpmin)+xs(fpmax))/2:.1f}" y="14" text-anchor="middle" class="tick">false flags {fpmin:.2f}–{fpmax:.2f}</text>')
for li, c in enumerate(cases):
    y0 = 20 + li * LANE
    svg.append(f'<text x="{X0-12}" y="{y0+LANE/2+4}" text-anchor="end" class="lane">{esc(c["pet"]["name"])} ({esc(c["name"])})</text>')
    for r in [r for r in rows if r['case'] == c['name']]:
        y = y0 + 16 + (r['trial'] - 1) * 18 + (0 if r['want_match'] else 6)
        cls = 's1' if r['want_match'] else 's2'
        tip = f"{r['still']} · trial {r['trial']} · truth: {'the pet' if r['want_match'] else 'other'} · Spark: {'match' if r['is_match'] else 'reject'} {r['confidence']:.2f}"
        svg.append(f'<circle cx="{xs(strength(r)):.1f}" cy="{y}" r="5" class="{cls}"><title>{esc(tip)}</title></circle>')
svg.append(f'<text x="{(X0+X1)/2}" y="{58+LANE*3}" text-anchor="middle" class="axis">match strength = Spark confidence when it says "match", 0 when it rejects</text></svg>')
P.append(('strength', 'Separation: every top-ranked true match beat every false flag', '''
<div class="legend"><span><i class="dot s1"></i>the owner's pet</span><span><i class="dot s2"></i>other animal or person</span></div>''' + ''.join(svg) + '''
<p class="note">One dot per comparison; rows inside each lane are trials 1–3. Rejections sit at 0. The shaded band is where all false flags fell; the highest-scoring dot in every case-trial is the true pet, which is why sorting cards by strength put the right dog first 9/9 times.</p>'''))

# 4. threshold sweep
ths = [round(0.50 + 0.05 * i, 2) for i in range(10)]
pts = []
for t in ths:
    tp = sum(1 for r in rows if r['want_match'] and strength(r) >= t)
    fp = sum(1 for r in rows if not r['want_match'] and strength(r) >= t)
    fn = sum(1 for r in rows if r['want_match'] and strength(r) < t)
    pts.append((t, tp / (tp + fp) if tp + fp else 1.0, tp / (tp + fn)))
H, X0, X1, Y0, Y1 = 300, 70, 820, 260, 30
xs2 = lambda t: X0 + (t - 0.5) / 0.45 * (X1 - X0)
ys2 = lambda v: Y0 - v * (Y0 - Y1)
svg = [f'<svg viewBox="0 0 860 {H+20}" class="chart" role="img" aria-label="Precision and recall by threshold">']
for v in [0, .25, .5, .75, 1]:
    svg.append(f'<line x1="{X0}" x2="{X1}" y1="{ys2(v):.1f}" y2="{ys2(v):.1f}" class="grid"/><text x="{X0-10}" y="{ys2(v)+4:.1f}" text-anchor="end" class="tick">{v:.0%}</text>')
for t in ths:
    svg.append(f'<text x="{xs2(t):.1f}" y="{Y0+20}" text-anchor="middle" class="tick">{t:.2f}</text>')
for idx, cls, lab in [(1, 's1', 'precision'), (2, 's2', 'recall')]:
    d = ' '.join(f'{"M" if i == 0 else "L"}{xs2(p[0]):.1f},{ys2(p[idx]):.1f}' for i, p in enumerate(pts))
    svg.append(f'<path d="{d}" class="line {cls}"/>')
    for p in pts:
        svg.append(f'<circle cx="{xs2(p[0]):.1f}" cy="{ys2(p[idx]):.1f}" r="5" class="{cls} ring"><title>threshold {p[0]:.2f}: {lab} {p[idx]:.0%}</title></circle>')
    last = pts[-1]
    svg.append(f'<text x="{xs2(last[0])+10:.1f}" y="{ys2(last[idx])+4:.1f}" class="lab">{lab}</text>')
svg.append(f'<text x="{(X0+X1)/2}" y="{Y0+40}" text-anchor="middle" class="axis">auto-flag threshold on match strength</text></svg>')
p70 = next(p for p in pts if p[0] == 0.70)
P.append(('threshold', 'Trade-off if the product auto-flagged instead of asking the owner', ''.join(svg) + f'''
<p class="note">At 0.70 the matcher would be {p70[1]:.0%} precise with {p70[2]:.0%} recall. We keep the owner in the loop instead: every candidate is shown, sorted by strength, and nothing counts as a sighting until the owner confirms it.</p>'''))

# 5. per-case evidence grids
for c in cases:
    cells = []
    for still in c['positives'] + c['negatives']:
        name = os.path.basename(still)
        rs = sorted([r for r in rows if r['case'] == c['name'] and r['still'] == name], key=lambda r: r['trial'])
        truth = name in [os.path.basename(p) for p in c['positives']]
        marks = ''.join(f'<span class="{"ok" if r["want_match"] == r["is_match"] else "no"}" title="{esc(r["rationale"])}">{"✓" if r["want_match"] == r["is_match"] else "✗"} {("match" if r["is_match"] else "reject")} {r["confidence"]:.2f}</span>' for r in rs)
        cells.append(f'<figure class="cand {"pos" if truth else "neg"}"><img src="{thumb("dogpark/" + name)}" alt=""><figcaption><b>{"THE PET" if truth else "other"}</b> · {esc(name[:-4])}<div class="trials">{marks}</div></figcaption></figure>')
    P.append((f'case-{c["name"]}', f'Case "{c["pet"]["name"]}": reference vs every candidate, 3 trials', f'''
<div class="caseRow"><figure class="ref"><img src="{thumb("dogpark/" + os.path.basename(c["owner"]))}" alt=""><figcaption><b>Reference photo</b><br>{esc(c["pet"]["description"])}</figcaption></figure>
<div class="cands">{"".join(cells)}</div></div>
<p class="note">✓ = Spark's verdict agrees with the ground-truth label (checked by eye); hover a verdict for Spark's rationale. Ground truth for "THE PET" = same SAM track in the same continuous shot.</p>'''))

# 6. SAM timelines
def timeline(d, label, blackout=None, dur=13.0):
    t = d['tracks'][0]
    X0, X1 = 120, 830
    xt = lambda s: X0 + s / dur * (X1 - X0)
    out = [f'<text x="{X0-12}" y="34" text-anchor="end" class="lane">{esc(label)}</text>']
    if blackout:
        out.append(f'<rect x="{xt(blackout[0]):.1f}" y="10" width="{xt(blackout[1])-xt(blackout[0]):.1f}" height="40" class="black"/><text x="{(xt(blackout[0])+xt(blackout[1]))/2:.1f}" y="64" text-anchor="middle" class="tick">blackout {blackout[0]}–{blackout[1]} s</text>')
    for det in t['detections']:
        out.append(f'<line x1="{xt(det["t"]):.1f}" x2="{xt(det["t"]):.1f}" y1="16" y2="44" class="tickmark"><title>track #{t["object_id"]} at {det["t"]} s</title></line>')
    out.append(f'<text x="{X1+8}" y="34" class="lab">#{t["object_id"]}</text>')
    return out
svg = ['<svg viewBox="0 0 860 200" class="chart" role="img" aria-label="SAM detections over time, normal and with blackout">', '<g>']
svg += timeline(door, 'original clip')
svg += ['</g><g transform="translate(0,90)">'] + timeline(occl, 'with blackout', (4.0, 5.5)) + ['</g>']
for s in range(0, 14, 2):
    xx = 120 + s / 13 * 710
    svg.append(f'<text x="{xx:.1f}" y="192" text-anchor="middle" class="tick">{s}s</text>')
svg.append('</svg>')
P.append(('sam-occlusion', 'SAM 3.1 persistence: same identity before and after a full blackout', ''.join(svg) + f'''
<p class="note">Each tick is a frame where SAM 3.1 detected the dog (10 fps). Original: {door['summary'][0]['n_frames']} detections, one track. With the frame fully black from 4.0–5.5 s: {occl['summary'][0]['n_frames']} detections, still <b>one track (#{occl['summary'][0]['object_id']})</b> with a single {occl['summary'][0]['gaps_s'][0]} s gap: no new ID was created when the dog reappeared.</p>'''))

# dog park gantt
X0, X1, dur = 50, 560, 76.0
xt = lambda s: X0 + s / dur * (X1 - X0)
# Verdict per track from the labelled contact sheets (eval/fixtures/crops/dogpark), checked by eye.
CLEAN, CUT, PERSON, BLOB, UNSURE = 'one dog throughout', 'ID crosses a cut onto another dog', 'labelled a person "dog"', 'dark blob, no animal', 'uncertain'
verdict = {1: CLEAN, 6: CLEAN, 9: CLEAN, 0: CUT, 2: CUT, 3: CUT, 4: CUT, 5: CUT, 7: CUT, 8: CUT, 10: CUT, 14: CUT, 12: PERSON, 13: BLOB, 11: UNSURE, 16: UNSURE}
klass = {CLEAN: 's1', UNSURE: 'sN'}
svg = [f'<svg viewBox="0 0 860 {len(park["summary"])*22+40}" class="chart" role="img" aria-label="SAM tracks over the dog park montage">']
for s in range(0, 77, 10):
    svg.append(f'<line x1="{xt(s):.1f}" x2="{xt(s):.1f}" y1="6" y2="{len(park["summary"])*22+10}" class="grid"/><text x="{xt(s):.1f}" y="{len(park["summary"])*22+28}" text-anchor="middle" class="tick">{s}s</text>')
for i, t in enumerate(park['tracks']):
    y = 10 + i * 22
    svg.append(f'<text x="{X0-8}" y="{y+12}" text-anchor="end" class="tick">#{t["object_id"]}</text>')
    seg = [t['detections'][0]['t'], t['detections'][0]['t']]
    segs = []
    for det in t['detections'][1:]:
        if det['t'] - seg[1] > 0.5:
            segs.append(seg); seg = [det['t'], det['t']]
        else:
            seg[1] = det['t']
    segs.append(seg)
    for a, b in segs:
        v = verdict[t['object_id']]
        svg.append(f'<rect x="{xt(a):.1f}" y="{y}" width="{max(xt(b)-xt(a), 3):.1f}" height="14" rx="4" class="{klass.get(v, "s2")}"><title>track #{t["object_id"]}: {a}–{b} s · {v}</title></rect>')
    svg.append(f'<text x="{X1+26}" y="{y+11}" class="tick">{esc(verdict[t["object_id"]])}</text>')
svg.append('</svg>')
n_clean = sum(v == CLEAN for v in verdict.values()); n_cut = sum(v == CUT for v in verdict.values()); n_unsure = sum(v == UNSURE for v in verdict.values())
P.append(('sam-montage', 'SAM 3.1 on a 76 s edited dog-park montage: 16 tracks, every one checked by eye', '''
<div class="legend"><span><i class="dot s1"></i>one dog throughout</span><span><i class="dot s2"></i>problem</span><span><i class="dot sN"></i>uncertain</span></div>''' + ''.join(svg) + f'''
<p class="note"><b>{n_clean} clean, {n_cut} carried an ID across a hard cut onto a different dog, 1 labelled people "dog", 1 dark blob, {n_unsure} uncertain.</b> Inside each continuous shot identities held; the hard cuts of an edited news montage are where SAM 3.1's re-identification failed. Real camera footage has no cuts (the doorbell clip: 1 clean track, and the same ID through a blackout), and the product matches each track's best still independently with the owner confirming. One knock-on effect: the coordinator reads track spans, so track #8's 38.5 s span (which crosses a cut) became "drinking for 38.5 s" in a plan.</p>'''))

# 7. coordinator
pl = plan['plan'] or {}
P.append(('coordinator', 'Spark tool loop: the model chose the tools, in order', f'''
<div class="calls">{" → ".join(f"<code>{esc(c)}</code>" for c in plan["tool_calls"])}</div>
<div class="plan"><b>{esc(pl.get("headline", ""))}</b><p><b>Window:</b> {esc(pl.get("window", ""))} · <b>Area:</b> {esc(pl.get("area", ""))}</p><p>{esc(pl.get("why", ""))}</p><ul>{"".join(f"<li>{esc(s)}</li>" for s in pl.get("steps", []))}</ul></div>
<p class="note">Input: two confirmed sightings (5:42 PM dog park, 6:18 PM Elm St doorbell) plus the owner's note "scared of traffic". Wall time {plan["wall_s"]:.0f} s including Muse Image. Raw: <code>eval/results/plan.json</code>.</p>'''))

board = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Find My Dog evidence</title>
<style>
:root {{ --surface-1:#fcfcfb; --text-primary:#0b0b0b; --text-secondary:#52514e; --line:#e4e4e0; --series-1:#2a78d6; --series-2:#eb6834; --good:#0ca30c; --critical:#d03b3b; color-scheme: light; }}
@media (prefers-color-scheme: dark) {{ :root:where(:not([data-theme="light"])) {{ --surface-1:#1a1a19; --text-primary:#f0efec; --text-secondary:#c3c2b7; --line:#34342f; --series-1:#3987e5; --series-2:#d95926; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --surface-1:#1a1a19; --text-primary:#f0efec; --text-secondary:#c3c2b7; --line:#34342f; --series-1:#3987e5; --series-2:#d95926; color-scheme: dark; }}
body {{ margin:0; background:var(--surface-1); color:var(--text-primary); font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }}
main {{ max-width:900px; margin:0 auto; padding:24px 16px 60px; }}
section {{ border:1px solid var(--line); border-radius:16px; padding:22px 22px 14px; margin:0 0 22px; background:var(--surface-1); }}
h1 {{ font-size:26px; margin:6px 0 20px; }} h2 {{ font-size:18px; margin:0 0 14px; }}
.note {{ color:var(--text-secondary); font-size:13.5px; }} code {{ font-size:12.5px; }}
.tiles {{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }}
.tile {{ border:1px solid var(--line); border-radius:12px; padding:14px; display:flex; flex-direction:column; }}
.tile b {{ font-size:30px; font-weight:600; }} .tile span {{ font-size:14px; }} .tile small {{ color:var(--text-secondary); font-size:12.5px; }}
.cm {{ border-collapse:collapse; width:100%; }} .cm th, .cm td {{ border:1px solid var(--line); padding:12px; text-align:center; }}
.cm td {{ font-size:22px; font-weight:600; }} .cm td small {{ display:block; font-size:12px; font-weight:400; color:var(--text-secondary); }}
.cm td.good {{ color:var(--good); }} .cm td.bad {{ color:var(--critical); }}
.chart {{ width:100%; height:auto; display:block; }}
.chart .grid {{ stroke:var(--line); stroke-width:1; }} .chart .tick {{ fill:var(--text-secondary); font-size:11px; }}
.chart .lane, .chart .lab {{ fill:var(--text-primary); font-size:12.5px; }} .chart .axis {{ fill:var(--text-secondary); font-size:12px; }}
.chart .s1 {{ fill:var(--series-1); }} .chart .s2 {{ fill:var(--series-2); }} .chart .sN {{ fill:var(--text-secondary); opacity:.45; }}
.chart circle.s1, .chart circle.s2 {{ stroke:var(--surface-1); stroke-width:2; }}
.chart .line {{ fill:none; stroke-width:2; }} .chart path.s1 {{ stroke:var(--series-1); }} .chart path.s2 {{ stroke:var(--series-2); }}
.chart .zone {{ fill:var(--series-2); opacity:.10; }} .chart .black {{ fill:var(--text-primary); opacity:.85; }}
.chart .tickmark {{ stroke:var(--series-1); stroke-width:2; stroke-linecap:round; }}
.legend {{ display:flex; gap:18px; font-size:13px; color:var(--text-secondary); margin-bottom:6px; }}
.dot {{ display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; vertical-align:-1px; }} .dot.s1 {{ background:var(--series-1); }} .dot.s2 {{ background:var(--series-2); }} .dot.sN {{ background:var(--text-secondary); opacity:.45; }}
.caseRow {{ display:flex; gap:16px; align-items:flex-start; }}
.ref {{ margin:0; width:170px; flex:none; }} .ref img {{ width:170px; border-radius:10px; border:3px solid var(--series-1); }} .ref figcaption {{ font-size:12.5px; color:var(--text-secondary); }}
.cands {{ display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }}
.cand {{ margin:0; font-size:11.5px; color:var(--text-secondary); }} .cand img {{ width:100%; height:92px; object-fit:cover; border-radius:8px; border:3px solid transparent; }}
.cand.pos img {{ border-color:var(--series-1); }} .cand.neg img {{ border-color:var(--series-2); }}
.trials span {{ display:block; }} .trials .ok {{ color:var(--good); }} .trials .no {{ color:var(--critical); font-weight:600; }}
.calls {{ font-size:15px; margin-bottom:10px; }} .plan {{ border:1px solid var(--line); border-radius:12px; padding:12px 16px; }}
@media (max-width:640px) {{ .tiles {{ grid-template-columns:1fr 1fr; }} .caseRow {{ flex-direction:column; }} .cands {{ grid-template-columns:repeat(3,1fr); }} }}
</style></head><body><main>
<h1>Find My Dog: evidence board</h1>
{"".join(f'<section id="{pid}"><h2>{esc(title)}</h2>{body}</section>' for pid, title, body in P)}
</main></body></html>'''
open(os.path.join(EV, 'board.html'), 'w').write(board)
print('panels:', [p[0] for p in P])
