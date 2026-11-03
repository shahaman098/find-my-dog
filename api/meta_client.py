"""Shared Meta Model API client.

One OpenAI-SDK client pointed at api.meta.ai covers Spark (chat/structured
output), SAM 3.1 (Responses API with input_video), and Muse Image. Voice
Transcribe is a custom multipart endpoint, handled with httpx here.
"""
import base64
import io

from openai import OpenAI
from PIL import Image

from .config import (
    IMAGE_MODEL,
    META_API_KEY,
    META_BASE_URL,
    SAM_MODEL,
    SPARK_MODEL,
    VOICE_MODEL,
)
from .sam_parse import merge_records, parse_segmentation


def client() -> OpenAI:
    return OpenAI(api_key=META_API_KEY, base_url=META_BASE_URL)


def spark(messages: list[dict], *, json_schema: dict | None = None, bulk: bool = False) -> str | dict:
    """Chat completion via the Responses-compatible endpoint. Structured output if schema given."""
    c = client()
    model = SPARK_MODEL
    kwargs = {"model": model, "input": messages}
    if json_schema:
        kwargs["text"] = {"format": {"type": "json_schema", "name": json_schema["name"], "schema": json_schema["schema"], "strict": True}}
    resp = c.responses.create(**kwargs)
    if json_schema:
        import json
        return json.loads(resp.output_text)
    return resp.output_text


def track_video(file_id: str, concept: str) -> list[dict]:
    """SAM 3.1: one concept prompt over a whole uploaded video -> merged tracks.

    `file_id` comes from client().files.create(file=..., purpose="user_data").
    """
    c = client()
    stream = c.responses.create(
        model=SAM_MODEL,
        input=[{
            "type": "message",
            "role": "user",
            "content": [
                {"type": "input_text", "text": concept},
                {"type": "input_video", "file_id": file_id},
            ],
        }],
        stream=True,
    )
    chunks: list[str] = []
    for event in stream:
        if event.type == "response.output_text.delta":
            chunks.append(event.delta)
    return parse_segmentation("".join(chunks))


def track_video_merged(file_id: str, concept: str, fps: float, offset_s: float = 0.0) -> list[dict]:
    records = track_video(file_id, concept)
    return merge_records(records, fps=fps, offset_s=offset_s)


def transcribe_audio(file_path, language: str | None = None) -> dict:
    """POST /v1/asr/transcribe — multipart file upload, returns dict with text/segments."""
    import httpx
    from .config import META_API_KEY, META_BASE_URL
    data = {"model": VOICE_MODEL}
    if language:
        data["language"] = language
    with open(file_path, "rb") as f:
        r = httpx.post(
            f"{META_BASE_URL}/asr/transcribe",
            headers={"Authorization": f"Bearer {META_API_KEY}"},
            files={"file": f},
            data=data,
            timeout=300,
        )
    r.raise_for_status()
    return r.json()


def generate_poster(prompt: str, size: str = "1024x1536") -> bytes:
    """Muse Image: text -> PNG bytes for the shareable alert poster."""
    c = client()
    img = c.images.generate(model=IMAGE_MODEL, prompt=prompt, size=size)
    if getattr(img, "data", None) and img.data[0].b64_json:
        return base64.b64decode(img.data[0].b64_json)
    raise RuntimeError("no image returned")


def crop_still(video_frame_path: str, box: dict, out_path: str, pad: float = 0.08) -> str:
    """Crop a detection box (with padding) out of an extracted frame image."""
    im = Image.open(video_frame_path)
    W, H = im.size
    x1 = max(0, int(box["x1"] - pad * (box["x2"] - box["x1"])))
    y1 = max(0, int(box["y1"] - pad * (box["y2"] - box["y1"])))
    x2 = min(W, int(box["x2"] + pad * (box["x2"] - box["x1"])))
    y2 = min(H, int(box["y2"] + pad * (box["y2"] - box["y1"])))
    im.crop((x1, y1, x2, y2)).save(out_path)
    return out_path
