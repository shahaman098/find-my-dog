"""Comparison composites for EVIDENCE.md (run after capture_real_ui.cjs and the benchmark).
    python3 evidence/compose.py
"""
import json, os, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'evidence', 'img')
os.chdir(ROOT)
F = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', s)
INK, SUB, BAD, GOOD, BLUE = (11, 11, 11), (82, 81, 78), (208, 59, 59), (12, 130, 12), (42, 120, 214)

# poster: first real run (invented phone number) vs after the prompt fix
a, b = Image.open('eval/results/poster.png').convert('RGB'), Image.open('eval/results/poster.webp').convert('RGB')
h = 900
a, b = a.resize((int(a.width * h / a.height), h)), b.resize((int(b.width * h / b.height), h))
im = Image.new('RGB', (a.width + b.width + 60, h + 120), 'white'); d = ImageDraw.Draw(im)
im.paste(a, (20, 110)); im.paste(b, (40 + a.width, 110))
d.text((20, 18), 'BEFORE', fill=BAD, font=F(28)); d.text((20, 56), 'invented "(555) 123-4567" + a reward', fill=BAD, font=F(19))
d.text((40 + a.width, 18), 'AFTER', fill=GOOD, font=F(28)); d.text((40 + a.width, 56), 'prompt forbids invented contacts: blank line', fill=GOOD, font=F(19))
d.text((20, 84), 'same tool loop, same sightings; Muse Image called by Spark (make_poster)', fill=SUB, font=F(15))
im.save(os.path.join(IMG, 'compare-poster-before-after.jpg'), quality=88)

# doorbell frame with SAM's box + 5x zoom
tr = json.load(open('eval/results/doorcam.tracks.json'))['tracks'][0]
det = min(tr['detections'], key=lambda x: abs(x['t'] - 3.4)); bx = det['box']
with tempfile.TemporaryDirectory() as tmp:
    fp = os.path.join(tmp, 'f.png')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(det['t']), '-i', 'eval/fixtures/doorcam_10fps.mp4', '-frames:v', '1', fp], check=True)
    fr = Image.open(fp).convert('RGB')
crop = fr.crop((bx['x1'] - 10, bx['y1'] - 10, bx['x2'] + 10, bx['y2'] + 10)); crop = crop.resize((crop.width * 5, crop.height * 5), Image.LANCZOS)
d = ImageDraw.Draw(fr); d.rectangle((bx['x1'], bx['y1'], bx['x2'], bx['y2']), outline=BLUE, width=4); d.text((bx['x1'], bx['y1'] - 30), 'SAM 3.1 · track #0', fill=BLUE, font=F(22))
out = Image.new('RGB', (fr.width + crop.width + 40, max(fr.height, crop.height + 120)), 'white'); out.paste(fr, (0, 0)); out.paste(crop, (fr.width + 20, 90))
d = ImageDraw.Draw(out)
d.text((fr.width + 20, 20), f'5x zoom of the box ({bx["x2"] - bx["x1"]}x{bx["y2"] - bx["y1"]} px)', fill=INK, font=F(22))
d.text((fr.width + 20, 52), f'frame at {det["t"]} s of a real doorbell clip', fill=SUB, font=F(18))
out.thumbnail((1800, 1800)); out.save(os.path.join(IMG, 'sam-doorbell-detection.jpg'), quality=88)

# owner vs stranger
o = Image.open(os.path.join(IMG, 'real-02-spark-match-ranked.jpg')).convert('RGB')
s = Image.open(os.path.join(IMG, 'access-stranger-view-only.jpg')).convert('RGB')
o = o.crop((0, 0, o.width, min(o.height, 1600))); hh = 1100
o, s = o.resize((int(o.width * hh / o.height), hh)), s.resize((int(s.width * hh / s.height), hh))
im = Image.new('RGB', (o.width + s.width + 60, hh + 80), 'white'); im.paste(o, (20, 70)); im.paste(s, (40 + o.width, 70)); d = ImageDraw.Draw(im)
d.text((20, 20), 'OWNER (holds the token): confirm / reject', fill=INK, font=F(22))
d.text((40 + o.width, 20), 'ANYONE ELSE with the link: view only', fill=INK, font=F(22))
im.save(os.path.join(IMG, 'compare-owner-vs-stranger.jpg'), quality=86)
print('composites written')
