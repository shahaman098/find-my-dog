"""Privacy pass: blur every region SAM 3.1 tracked as a person or licence plate, frame by frame.

    node eval/benchmark.ts track --clip IN.mp4 --fps 10 --concept person        --out IN.person.tracks.json
    node eval/benchmark.ts track --clip IN.mp4 --fps 10 --concept "license plate" --out IN.plate.tracks.json
    python3 production/blur_people.py IN.mp4 OUT.mp4 IN.person.tracks.json [IN.plate.tracks.json ...]

Boxes are padded and held for +-2 frames so a missed detection on one frame never exposes a face.
"""
import json, subprocess, sys
from PIL import Image, ImageFilter

src, dst, *track_files = sys.argv[1:]
w, h = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]).decode().strip().split(','))

boxes = {}  # frame -> list of (x1, y1, x2, y2)
for tf in track_files:
    for t in json.load(open(tf))['tracks']:
        for d in t['detections']:
            b = d['box']
            for f in range(d['frame'] - 2, d['frame'] + 3):  # temporal hold
                boxes.setdefault(f, []).append((b['x1'], b['y1'], b['x2'], b['y2']))

dec = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', '10', '-i', '-',
                        '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst], stdin=subprocess.PIPE)
frame, blurred = 0, 0
while True:
    raw = dec.stdout.read(w * h * 3)
    if len(raw) < w * h * 3:
        break
    im = Image.frombytes('RGB', (w, h), raw)
    for x1, y1, x2, y2 in boxes.get(frame, []):
        pw, ph = (x2 - x1) * 0.2, (y2 - y1) * 0.2
        r = (max(0, int(x1 - pw)), max(0, int(y1 - ph)), min(w, int(x2 + pw)), min(h, int(y2 + ph)))
        if r[2] - r[0] < 2 or r[3] - r[1] < 2:
            continue
        region = im.crop(r)
        # heavy pixelate + blur: irreversible, still reads as "a person" so the scene makes sense
        small = region.resize((max(1, region.width // 14), max(1, region.height // 14)), Image.BILINEAR)
        im.paste(small.resize(region.size, Image.NEAREST).filter(ImageFilter.GaussianBlur(6)), r)
        blurred += 1
    enc.stdin.write(im.tobytes())
    frame += 1
enc.stdin.close(); enc.wait(); dec.wait()
print(f'{frame} frames, {blurred} regions blurred -> {dst}')
