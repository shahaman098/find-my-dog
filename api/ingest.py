"""Ingest: clip upload -> 2fps re-encode -> SAM 3.1 concept tracking -> track stills.

Cost control: re-encoding to 2fps cuts billed frames ~15x vs raw 30fps
(a 30s clip bills ~60 frames = $0.012 instead of 900 = $0.18).
Track timestamps are exact: frame N at fps=2 -> t = N/2 seconds into the clip.
"""
import json
import subprocess
import uuid

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from . import meta_client, store
from .config import report_dir

router = APIRouter(prefix="/api/reports/{report_id}")

# Bill at least 50 frames per SAM request; raise sampling fps for very short clips.
MIN_FRAMES = 50
TARGET_FPS = 2.0


def _probe(path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def _reencode_2fps(src, dst, duration: float) -> float:
    """Re-encode at TARGET_FPS, bumping fps for short clips so we clear MIN_FRAMES."""
    fps = TARGET_FPS
    if duration * fps < MIN_FRAMES:
        fps = min(6.0, round(MIN_FRAMES / max(duration, 1.0), 2))
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-vf", f"fps={fps},scale='min(1280,iw)':-2",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-an", str(dst)],
        capture_output=True, text=True, check=True,
    )
    return fps


def _extract_frame_still(video_path, t: float, out_path):
    subprocess.run(
        ["ffmpeg", "-y", "-ss", str(max(t - 0.01, 0)), "-i", str(video_path),
         "-frames:v", "1", "-q:v", "3", str(out_path)],
        capture_output=True, text=True, check=True,
    )


def process_clip(report_id: str, clip_id: str):
    """Background worker: encode -> upload -> SAM -> stills. Status lives in state.json."""
    rd = report_dir(report_id)
    raw = rd / "clips" / f"{clip_id}_raw"
    small = rd / "clips" / f"{clip_id}_2fps.mp4"

    def set_clip(fn):
        def inner(state):
            for c in state["clips"]:
                if c["clip_id"] == clip_id:
                    fn(c)
        return store.update_state(report_id, inner)

    try:
        meta = _probe(raw)
        duration = float(meta["format"]["duration"])
        fps = _reencode_2fps(raw, small, duration)
        set_clip(lambda c: c.update({"status": "uploading", "fps": fps, "duration_s": duration}))

        with open(small, "rb") as f:
            uploaded = meta_client.client().files.create(file=f, purpose="user_data")

        species = store.read_state(report_id)["pet"]["species"]
        concept = species if species in ("dog", "cat") else "dog"
        set_clip(lambda c: c.update({"status": "tracking", "file_id": uploaded.id}))

        tracks = meta_client.track_video_merged(uploaded.id, concept, fps=fps)
        set_clip(lambda c: c.update({"status": "extracting", "tracks": tracks}))

        # One representative still per track: brightest-confidence detection near first_seen.
        stills_dir = rd / "stills"
        for t in tracks:
            best = max(t["detections"], key=lambda d: d["confidence"] or 0)
            frame_path = stills_dir / f"{clip_id}_f{best['frame']}.jpg"
            _extract_frame_still(small, best["t"], frame_path)
            meta_client.crop_still(str(frame_path), best["box"], str(stills_dir / f"{clip_id}_{t['object_id']}.jpg"))
            frame_path.unlink(missing_ok=True)

        set_clip(lambda c: c.update({"status": "done", "n_tracks": len(tracks)}))
    except Exception as e:
        set_clip(lambda c: c.update({"status": "error", "error": str(e)[:500]}))


@router.post("/clips")
async def upload_clip(
    report_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    label: str = Form(""),
    captured_clock: str = Form(""),  # e.g. "7:42 PM" shown on the timeline
):
    state = store.read_state(report_id)
    if not state:
        raise HTTPException(404, "report not found")
    clip_id = uuid.uuid4().hex[:8]
    rd = report_dir(report_id)
    raw = rd / "clips" / f"{clip_id}_raw"
    with raw.open("wb") as f:
        import shutil
        shutil.copyfileobj(file.file, f)

    clip = {
        "clip_id": clip_id, "filename": file.filename, "label": label or file.filename,
        "captured_clock": captured_clock, "fps": None, "duration_s": None,
        "file_id": None, "status": "queued", "error": None, "tracks": [], "n_tracks": 0,
    }
    store.update_state(report_id, lambda s: s["clips"].append(clip))
    background.add_task(process_clip, report_id, clip_id)
    return clip


@router.delete("/clips/{clip_id}")
async def delete_clip(report_id: str, clip_id: str):
    def fn(state):
        state["clips"] = [c for c in state["clips"] if c["clip_id"] != clip_id]
        state["matches"] = [m for m in state["matches"] if m["clip_id"] != clip_id]
    return store.update_state(report_id, fn)
