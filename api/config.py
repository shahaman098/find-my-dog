"""Config: env + paths. Everything lives under DATA_DIR, one folder per report."""
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

META_API_KEY = os.environ.get("META_API_KEY", "")
META_BASE_URL = os.environ.get("META_BASE_URL", "https://api.meta.ai/v1")

SPARK_MODEL = os.environ.get("SPARK_MODEL", "muse-spark-1.3")
SPARK_BULK_MODEL = os.environ.get("SPARK_BULK_MODEL", "muse-spark-1.3-contributor")
SAM_MODEL = "sam-3.1"
IMAGE_MODEL = "muse-image-1.0"
VOICE_MODEL = "muse-voice-transcribe-1.0"

# Open-weight bonus: Muse Glimmer on Baseten (drop-in when credits land).
BASETEN_API_KEY = os.environ.get("BASETEN_API_KEY", "")
GLIMMER_MODEL = os.environ.get("GLIMMER_MODEL", "meta-models/muse-glimmer")

APP_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", APP_ROOT / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)


def new_report_id() -> str:
    return uuid.uuid4().hex[:12]


def report_dir(report_id: str) -> Path:
    d = DATA_DIR / report_id
    (d / "clips").mkdir(parents=True, exist_ok=True)
    (d / "stills").mkdir(parents=True, exist_ok=True)
    return d
