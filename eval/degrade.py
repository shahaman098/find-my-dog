"""Doorbell-conditions robustness set: degrade the *camera* crops (never the owner's reference photo)
and write one cases file per condition for `eval/benchmark.ts match`.

    python3 eval/degrade.py
    for c in night_ir low_res motion_blur dark worst_case; do
      node eval/benchmark.ts match --cases eval/fixtures/cases_$c.json --trials 1 --out eval/results/robust_$c.json
    done

Deterministic: fixed RNG seed, so a re-run produces identical images.
"""
import json, os, random
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASES = json.load(open(os.path.join(ROOT, 'eval', 'match_cases.json')))
OUT = os.path.join(ROOT, 'eval', 'fixtures', 'crops', 'degraded')


def noise(im, amount, seed):
    rnd = random.Random(seed)
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            n = rnd.randint(-amount, amount)
            px[x, y] = tuple(max(0, min(255, c + n)) for c in p) if isinstance(p, tuple) else max(0, min(255, p + n))
    return im


def night_ir(im, seed):
    """Infrared night mode: monochrome, washed-out contrast, sensor noise."""
    g = ImageOps.grayscale(im)
    g = ImageEnhance.Contrast(g).enhance(0.7)
    g = ImageEnhance.Brightness(g).enhance(1.15)
    return noise(g.convert('RGB'), 18, seed)


def low_res(im, seed):
    """Distant animal: a quarter of the pixels in each dimension, upscaled back (what a crop of a far dog looks like)."""
    w, h = im.size
    return im.resize((max(8, w // 4), max(8, h // 4)), Image.BILINEAR).resize((w, h), Image.BILINEAR)


def motion_blur(im, seed):
    """Running animal at doorbell shutter speeds: 9-px horizontal smear."""
    # PIL kernels max out at 5x5, so average 9 horizontally shifted copies (= a 1x9 box filter).
    k = 9
    acc = None
    for i, dx in enumerate(range(-(k // 2), k // 2 + 1)):
        shifted = im.transform(im.size, Image.AFFINE, (1, 0, dx, 0, 1, 0), resample=Image.BILINEAR, fillcolor=None)
        acc = shifted if acc is None else Image.blend(acc, shifted, 1 / (i + 1))
    return acc


def dark(im, seed):
    """Dusk without IR: underexposed with colour noise."""
    return noise(ImageEnhance.Brightness(im).enhance(0.35), 10, seed)


def worst_case(im, seed):
    """Doorbell at night: IR mode on a distant, moving animal. (No 'dark' step: IR illuminates the scene.)"""
    return night_ir(motion_blur(low_res(im, seed), seed), seed)


CONDITIONS = {'night_ir': night_ir, 'low_res': low_res, 'motion_blur': motion_blur, 'dark': dark, 'worst_case': worst_case}

for name, fn in CONDITIONS.items():
    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    cases = []
    for c in CASES:
        def deg(p):
            dst = os.path.join(d, os.path.basename(p))
            if not os.path.exists(dst):
                seed = sum(map(ord, os.path.basename(p)))
                fn(Image.open(os.path.join(ROOT, p)).convert('RGB'), seed).save(dst, quality=90)
            return os.path.relpath(dst, ROOT)
        cases.append({**c, 'positives': [deg(p) for p in c['positives']], 'negatives': [deg(p) for p in c['negatives']]})
    json.dump(cases, open(os.path.join(ROOT, 'eval', 'fixtures', f'cases_{name}.json'), 'w'), indent=2)
    print(name, sum(len(c['positives']) + len(c['negatives']) for c in cases), 'degraded crops')
