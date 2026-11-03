"""Parser for SAM 3.1 segmentation output.

Output is streamed per-frame text, one frame per line:
    <Nf>objectId<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..[;c=..]|>[<|mask;...|>]

We only need frame number, object id, and box — masks stay on the API side
(one_bit keeps payloads small but we crop stills from the source frames by box).
"""
import re

FRAME_RE = re.compile(r"<(\d+)f>")
RECORD_RE = re.compile(r"(\d+)<\|box;x1=(-?\d+);y1=(-?\d+);x2=(-?\d+);y2=(-?\d+);w=(\d+);h=(\d+)(?:;c=([\d.]+))?\|>")


def parse_segmentation(text: str) -> list[dict]:
    """Return [{frame, object_id, box:{x1,y1,x2,y2,w,h}, confidence}] in frame order."""
    out = []
    # Frames arrive as separate deltas; normalize to one string and split on frame markers.
    parts = FRAME_RE.split(text)
    # parts: [pre, frame, payload, frame, payload, ...]
    for i in range(1, len(parts) - 1, 2):
        frame = int(parts[i])
        payload = parts[i + 1]
        for m in RECORD_RE.finditer(payload):
            obj_id = int(m.group(1))
            box = {
                "x1": int(m.group(2)), "y1": int(m.group(3)),
                "x2": int(m.group(4)), "y2": int(m.group(5)),
                "w": int(m.group(6)), "h": int(m.group(7)),
            }
            conf = float(m.group(8)) if m.group(8) else None
            out.append({"frame": frame, "object_id": obj_id, "box": box, "confidence": conf})
    return out


def merge_records(records: list[dict], fps: float, offset_s: float = 0.0) -> list[dict]:
    """Collapse per-frame records into tracks with real timestamps."""
    tracks: dict[int, dict] = {}
    for r in records:
        t = tracks.setdefault(r["object_id"], {"object_id": r["object_id"], "detections": []})
        t["detections"].append({
            "t": round(offset_s + r["frame"] / fps, 2),
            "frame": r["frame"],
            "box": r["box"],
            "confidence": r["confidence"],
        })
    result = []
    for t in tracks.values():
        dets = t["detections"]
        result.append({
            "object_id": t["object_id"],
            "n_frames": len(dets),
            "first_seen": dets[0]["t"],
            "last_seen": dets[-1]["t"],
            "confidence": max((d["confidence"] or 0) for d in dets) or None,
            "detections": dets,
        })
    result.sort(key=lambda x: x["first_seen"])
    return result
