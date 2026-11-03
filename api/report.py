"""Report endpoints: create a lost-pet report (photo + voice note) and read it."""
import base64
import shutil

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from . import meta_client, store

router = APIRouter(prefix="/api/reports")


@router.post("")
async def create_report(
    pet_name: str = Form(...),
    species: str = Form("dog"),  # dog | cat | other
    description: str = Form(""),
    photo: UploadFile = File(...),
    voice_note: UploadFile | None = File(None),
):
    state = store.create_report({
        "name": pet_name,
        "species": species,
        "description": description,
    })
    d = store.state_path  # noqa: F841  (state dirs already created by store)
    from .config import report_dir
    rd = report_dir(state["report_id"])

    photo_path = rd / "pet_photo.jpg"
    with photo_path.open("wb") as f:
        shutil.copyfileobj(photo.file, f)
    store.update_state(state["report_id"], lambda s: s["pet"].update({"photo_path": str(photo_path)}))

    if voice_note is not None and voice_note.filename:
        vpath = rd / "voice_note.webm"
        with vpath.open("wb") as f:
            shutil.copyfileobj(voice_note.file, f)
        try:
            result = meta_client.transcribe_audio(vpath)
            text = result.get("text") or " ".join(
                seg.get("text", "") for seg in result.get("segments", []) if isinstance(seg, dict)
            )
            store.update_state(state["report_id"], lambda s: s.update({"transcript": text.strip()}))
        except Exception as e:  # transcript is additive, never fatal
            store.update_state(state["report_id"], lambda s: s.update({"transcript_error": str(e)[:300]}))

    return store.read_state(state["report_id"])


@router.post("/{report_id}/voice")
async def add_voice(report_id: str, voice_note: UploadFile = File(...)):
    state = store.read_state(report_id)
    if not state:
        raise HTTPException(404, "report not found")
    from .config import report_dir
    vpath = report_dir(report_id) / "voice_note.webm"
    with vpath.open("wb") as f:
        shutil.copyfileobj(voice_note.file, f)
    result = meta_client.transcribe_audio(vpath)
    text = result.get("text") or ""
    store.update_state(report_id, lambda s: s.update({"transcript": text.strip()}))
    return {"transcript": text.strip()}


@router.get("/{report_id}")
async def get_report(report_id: str):
    state = store.read_state(report_id)
    if not state:
        raise HTTPException(404, "report not found")
    return state


@router.get("/{report_id}/pet_photo")
async def pet_photo(report_id: str):
    state = store.read_state(report_id)
    if not state:
        raise HTTPException(404, "report not found")
    from fastapi.responses import FileResponse
    return FileResponse(state["pet"]["photo_path"])


@router.get("/{report_id}/stills/{clip_id}/{object_id}")
async def track_still(report_id: str, clip_id: str, object_id: int):
    state = store.read_state(report_id)
    if not state:
        raise HTTPException(404, "report not found")
    from .config import report_dir
    from fastapi.responses import FileResponse
    p = report_dir(report_id) / "stills" / f"{clip_id}_{object_id}.jpg"
    if not p.exists():
        raise HTTPException(404, "still not found")
    return FileResponse(p)


@router.get("/{report_id}/poster")
async def poster(report_id: str):
    state = store.read_state(report_id)
    if not state or not state.get("poster"):
        raise HTTPException(404, "no poster yet")
    from .config import report_dir
    from fastapi.responses import FileResponse
    return FileResponse(report_dir(report_id) / "poster.png")
