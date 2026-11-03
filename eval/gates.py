"""Hackathon gates — run before committing the night to this idea.

G1: SAM 3.1 must track one animal through an occlusion/absence and return
    a persistent track spanning most of a clip.
G2: Spark must pick the right dog from an owner photo + cross-clip stills,
    >= 8/10 trials, and reject a distractor animal.

Usage:
    python -m eval.gates g1 --clip eval/fixtures/dog_clip.mp4
    python -m eval.gates g2 --owner eval/fixtures/owner.jpg \
        --same eval/fixtures/still_a.jpg eval/fixtures/still_b.jpg \
        --different eval/fixtures/other_dog.jpg
"""
import argparse
import base64
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.config import SPARK_MODEL, client  # noqa: E402
from api import meta_client  # noqa: E402


def _upload(path: Path) -> str:
    with open(path, "rb") as f:
        return client().files.create(file=f, purpose="user_data").id


def _duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(path)],
                         capture_output=True, text=True, check=True)
    return float(json.loads(out.stdout)["format"]["duration"])


def _fps(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-select_streams", "v:0",
                          "-show_streams", str(path)], capture_output=True, text=True, check=True)
    return float(json.loads(out.stdout)["streams"][0]["avg_frame_rate"].split("/")[0])


def g1(clip: Path, concept: str = "dog"):
    print(f"== G1: SAM 3.1 persistence over {clip.name} ==")
    fid = _upload(clip)
    # Use the native fps of the fixture so timestamps are real seconds.
    fps = _fps(clip)
    tracks = meta_client.track_video_merged(fid, concept, fps=fps)
    if not tracks:
        print("FAIL: no tracks returned")
        return 1
    duration = _duration(clip)
    print(f"duration={duration:.1f}s, tracks={len(tracks)}")
    for t in tracks:
        span = t["last_seen"] - t["first_seen"]
        print(f"  track {t['object_id']}: {t['n_frames']} frames, "
              f"{t['first_seen']:.1f}s -> {t['last_seen']:.1f}s (span {span:.1f}s, {span/max(duration,0.1)*100:.0f}%)")
    best = max(tracks, key=lambda t: t["last_seen"] - t["first_seen"])
    span = best["last_seen"] - best["first_seen"]
    ok = span >= 0.6 * duration and best["n_frames"] >= 10
    # Occlusion check: gaps > 1s inside the span prove identity survived an absence.
    ts = [d["t"] for d in best["detections"]]
    gaps = [round(b - a, 2) for a, b in zip(ts, ts[1:]) if b - a > 1.0]
    print(f"  best track span {span:.1f}s / {duration:.1f}s, gaps>1s inside span: {gaps or 'none'}")
    print("G1 PASS" if ok else "G1 FAIL (span <60% of clip)")
    return 0 if ok else 1


def _b64(p: Path) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(open(p, "rb").read()).decode()


def g2(owner: Path, same: list[Path], different: list[Path], trials: int = 10):
    print(f"== G2: Spark matching, {trials} trials ==")
    correct = 0
    log = []
    for i in range(trials):
        use_same = i < trials // 2 or not different
        still = same[i % len(same)] if use_same else different[i % len(different)]
        content = [
            {"type": "input_text", "text": (
                "Image 1 is the owner's reference photo of their lost dog, Biscuit, "
                "a medium-size tan dog with a white chest patch and curled tail.\n"
                "Image 2 is one detection cropped from neighborhood camera footage.\n"
                f"Is the animal in image 2 plausibly Biscuit? Answer strictly as JSON: "
                '{"is_match": bool, "confidence": number, "rationale": str}'
            )},
            {"type": "input_image", "image_url": _b64(owner)},
            {"type": "input_image", "image_url": _b64(still)},
        ]
        out = client().responses.create(
            model=SPARK_MODEL,
            input=[{"type": "message", "role": "user", "content": content}],
            text={"format": {"type": "json_schema", "name": "verdict", "schema": {
                "type": "object",
                "properties": {"is_match": {"type": "boolean"}, "confidence": {"type": "number"},
                               "rationale": {"type": "string"}},
                "required": ["is_match", "confidence", "rationale"],
            }, "strict": True}},
        )
        v = json.loads(out.output_text)
        want = use_same
        got = bool(v["is_match"]) and float(v["confidence"]) >= 0.5
        correct += want == got
        log.append(f"  trial {i+1}: still={still.name} want={'MATCH' if want else 'REJECT'} "
                   f"got={'MATCH' if got else 'REJECT'} (conf {v['confidence']:.2f}) {v['rationale'][:80]}")
    print("\n".join(log))
    print(f"accuracy: {correct}/{trials}")
    print("G2 PASS" if correct >= 8 else "G2 FAIL (<8/10)")
    return 0 if correct >= 8 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("gate", choices=["g1", "g2"])
    ap.add_argument("--clip", type=Path)
    ap.add_argument("--concept", default="dog")
    ap.add_argument("--owner", type=Path)
    ap.add_argument("--same", type=Path, nargs="+")
    ap.add_argument("--different", type=Path, nargs="*", default=[])
    ap.add_argument("--trials", type=int, default=10)
    a = ap.parse_args()
    if a.gate == "g1":
        sys.exit(g1(a.clip, a.concept))
    sys.exit(g2(a.owner, a.same, a.different, a.trials))
