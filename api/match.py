"""Matching: owner photo + description vs one still per SAM track.

Structured-output call; runs on Muse Glimmer (Baseten, open-weight $10K bonus)
when BASETEN_API_KEY is set, otherwise on hosted muse-spark-1.3.
The system never claims certainty — the owner confirms matches in the UI.
"""
import base64

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .config import (
    BASETEN_API_KEY,
    GLIMMER_MODEL,
    SPARK_MODEL,
    report_dir,
)
from . import meta_client, store

router = APIRouter(prefix="/api/reports/{report_id}")

SCHEMA = {
    "name": "match_verdicts",
    "schema": {
        "type": "object",
        "properties": {
            "matches": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "track": {"type": "string"},
                        "is_match": {"type": "boolean"},
                        "confidence": {"type": "number"},
                        "rationale": {"type": "string"},
                    },
                    "required": ["track", "is_match", "confidence", "rationale"],
                },
            }
        },
        "required": ["matches"],
    },
}


def _b64(path) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(open(path, "rb").read()).decode()


def _content_for_track(pet, track_ref: str, still_path, transcript: str) -> list[dict]:
    desc = pet["description"]
    if transcript:
        desc += f"\nOwner's voice note: \"{transcript}\""
    return [
        {"type": "input_text", "text": (
            f"Lost pet report. Name: {pet['name']}. Species: {pet['species']}.\n"
            f"Description: {desc}\n\n"
            f"Image 1 is the owner's reference photo of {pet['name']}. "
            f"Image 2 is one detection ({track_ref}) cropped from neighborhood camera footage.\n"
            f"Decide whether the animal in image 2 could be {pet['name']}. "
            "Judge by robust appearance attributes (coat color/pattern, size, build, marking, ear/tail shape). "
            "If image 2 shows no animal or an unusable crop, is_match=false with low confidence."
        )},
        {"type": "input_image", "image_url": _b64(pet["photo_path"])},
        {"type": "input_image", "image_url": _b64(still_path)},
    ]


def _match_with_glimmer(content: list[dict]) -> dict:
    import json
    r = httpx.post(
        "https://inference.baseten.co/v1/chat/completions",
        headers={"Authorization": f"Api-Key {BASETEN_API_KEY}"},
        json={
            "model": GLIMMER_MODEL,
            "messages": [{"role": "user", "content": content}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "match_verdicts", "strict": True, "schema": SCHEMA["schema"]}},
            "max_tokens": 2048,
        },
        timeout=180,
    )
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])


@router.post("/match")
async def run_match(report_id: str):
    state = store.read_state(report_id)
    if not state:
        raise HTTPException(404, "report not found")
    rd = report_dir(report_id)

    # One candidate per (clip, object_id) with a still
    candidates = []
    for c in state["clips"]:
        for t in c.get("tracks", []):
            still = rd / "stills" / f"{c['clip_id']}_{t['object_id']}.jpg"
            if still.exists():
                candidates.append((c, t, still))
    if not candidates:
        raise HTTPException(400, "no tracked animals yet — ingest clips first")

    verdicts = []
    model_used = None
    if BASETEN_API_KEY:
        try:
            content = []
            for c, t, still in candidates:
                content = _content_for_track(state["pet"], f"{c['clip_id']}:{t['object_id']}", still, state.get("transcript") or "")
                out = _match_with_glimmer(content)
                verdicts.extend(out["matches"])
                model_used = f"glimmer:{GLIMMER_MODEL}"
        except Exception:
            verdicts = []
    if not verdicts:
        for c, t, still in candidates:
            content = _content_for_track(state["pet"], f"{c['clip_id']}:{t['object_id']}", still, state.get("transcript") or "")
            out = meta_client.client().responses.create(
                model=SPARK_MODEL,
                input=[{"type": "message", "role": "user", "content": content}],
                text={"format": {"type": "json_schema", "name": SCHEMA["name"], "schema": SCHEMA["schema"], "strict": True}},
            )
            import json
            verdicts.append(json.loads(out.output_text)["matches"][0])
            model_used = f"spark:{SPARK_MODEL}"

    def fn(state):
        state["matcher_model"] = model_used
        state["matches"] = [
            {
                "clip_id": v["track"].split(":")[0],
                "object_id": int(v["track"].split(":")[1]),
                "is_match": bool(v["is_match"]),
                "score": float(v["confidence"]),
                "rationale": v["rationale"],
                "confirmed": None,  # owner decides in the UI
            }
            for v in verdicts
        ]
    return store.update_state(report_id, fn)


@router.post("/matches/confirm")
async def confirm(report_id: str, clip_id: str, object_id: int, confirmed: bool):
    def fn(state):
        for m in state["matches"]:
            if m["clip_id"] == clip_id and m["object_id"] == object_id:
                m["confirmed"] = confirmed
    return store.update_state(report_id, fn)


@router.get("/stills/{clip_id}/{object_id}")
async def still(report_id: str, clip_id: str, object_id: int):
    p = report_dir(report_id) / "stills" / f"{clip_id}_{object_id}.jpg"
    if not p.exists():
        raise HTTPException(404, "still not found")
    return FileResponse(p)
