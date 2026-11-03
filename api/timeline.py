"""Timeline + the agentic step: Spark (tool loop) reviews confirmed sightings,
recommends the next search action, and generates the alert poster via Muse Image.
"""
import base64
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .config import report_dir
from . import store, meta_client
from .match import SCHEMA  # reuse the strict-schema style

router = APIRouter(prefix="/api/reports/{report_id}")

TOOLS = [
    {
        "type": "function",
        "name": "suggest_next_search",
        "description": "Record the recommended next search plan for the owner, based on the sighting pattern.",
        "parameters": {
            "type": "object",
            "properties": {
                "headline": {"type": "string"},
                "window": {"type": "string", "description": "e.g. 'dawn tomorrow, 5:30-7:30 AM'"},
                "area": {"type": "string"},
                "why": {"type": "string", "description": "reasoning from the sighting pattern"},
                "steps": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["headline", "window", "area", "why", "steps"],
        },
    },
    {
        "type": "function",
        "name": "make_poster",
        "description": "Generate a shareable lost-pet alert poster image.",
        "parameters": {
            "type": "object",
            "properties": {
                "poster_prompt": {"type": "string", "description": "visual description for the poster"},
                "headline_text": {"type": "string"},
            },
            "required": ["poster_prompt", "headline_text"],
        },
    },
]


def _sightings(state) -> list[dict]:
    rd = report_dir(state["report_id"])
    out = []
    for m in state["matches"]:
        if not m.get("confirmed"):
            continue
        clip = next((c for c in state["clips"] if c["clip_id"] == m["clip_id"]), None)
        track = next((t for t in clip["tracks"] if t["object_id"] == m["object_id"]), None) if clip else None
        if not (clip and track):
            continue
        out.append({
            "clip_id": clip["clip_id"],
            "object_id": m["object_id"],
            "place": clip.get("label") or clip["filename"],
            "clock": clip.get("captured_clock") or "",
            "t_in_clip": track["first_seen"],
            "duration_seen": round(track["last_seen"] - track["first_seen"], 1),
            "confidence": m["score"],
            "still": f"/api/reports/{state['report_id']}/stills/{m['clip_id']}/{m['object_id']}",
            "still_path": str(rd / "stills" / f"{m['clip_id']}_{m['object_id']}.jpg"),
        })
    out.sort(key=lambda s: (s["clock"], s["t_in_clip"]))
    return out


@router.get("/timeline")
async def timeline(report_id: str):
    state = store.read_state(report_id)
    if not state:
        raise HTTPException(404, "report not found")
    return {"sightings": _sightings(state), "next_search": state.get("next_search"), "poster": state.get("poster")}


@router.post("/analyze")
async def analyze(report_id: str):
    """Agentic loop: Spark decides which tools to run (search plan, poster)."""
    state = store.read_state(report_id)
    if not state:
        raise HTTPException(404, "report not found")
    sightings = _sightings(state)
    if not sightings:
        raise HTTPException(400, "no confirmed sightings yet")

    from .config import SPARK_MODEL, client
    c = client()
    pet = state["pet"]
    sighting_brief = json.dumps([
        {k: v for k, v in s.items() if k != "still_path"} for s in sightings
    ], indent=1)
    input_msg = [
        {"type": "input_text", "text": (
            f"You are the search coordinator for a lost {pet['species']} named {pet['name']}.\n"
            f"Owner description: {pet['description']}\n"
            f"Owner voice note transcript: {state.get('transcript') or 'n/a'}\n"
            f"Confirmed camera sightings (times are clock labels on each camera):\n{sighting_brief}\n\n"
            "Decide what to do next, using your tools: record a concrete next-search plan "
            "(suggest_next_search) and generate the shareable alert poster (make_poster). "
            "Then finish with a one-paragraph summary for the owner."
        )}
    ]
    # Attach the most confident still so the model sees the animal.
    best = max(sightings, key=lambda s: s["confidence"])
    input_msg.append({"type": "input_image", "image_url": "data:image/jpeg;base64," +
                      base64.b64encode(open(best["still_path"], "rb").read()).decode()})

    poster_saved = False
    next_search = None
    summary = ""
    for _turn in range(5):
        resp = c.responses.create(
            model=SPARK_MODEL,
            input=[{"type": "message", "role": "user", "content": input_msg}] if _turn == 0 else input_msg,
            tools=TOOLS,
        )
        calls = [o for o in resp.output if getattr(o, "type", "") == "function_call"]
        if not calls:
            summary = resp.output_text
            break
        input_msg.extend(resp.output)
        for call in calls:
            args = json.loads(call.arguments or "{}")
            if call.name == "suggest_next_search":
                next_search = args
                input_msg.append({"type": "function_call_output", "call_id": call.call_id, "output": "plan recorded"})
            elif call.name == "make_poster":
                try:
                    png = meta_client.generate_poster(
                        f"{args['poster_prompt']}. Bold headline text at top: '{args['headline_text']}'. "
                        "Clean lost-pet alert poster layout, high contrast, printable."
                    )
                    (report_dir(report_id) / "poster.png").write_bytes(png)
                    poster_saved = True
                    input_msg.append({"type": "function_call_output", "call_id": call.call_id, "output": "poster generated"})
                except Exception as e:
                    input_msg.append({"type": "function_call_output", "call_id": call.call_id,
                                      "output": f"poster generation failed: {str(e)[:200]}"})

    def fn(state):
        if next_search:
            state["next_search"] = next_search
        if poster_saved:
            state["poster"] = f"/api/reports/{report_id}/poster"
        if summary:
            state["summary"] = summary
    store.update_state(report_id, fn)
    return {"next_search": next_search, "poster": state["poster"] if poster_saved else None,
            "summary": summary, "sightings": sightings}


@router.get("/poster")
async def poster(report_id: str):
    p = report_dir(report_id) / "poster.png"
    if not p.exists():
        raise HTTPException(404, "no poster yet")
    return FileResponse(p)
