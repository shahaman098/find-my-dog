"""Report state: one JSON file per report under DATA_DIR/<id>/state.json."""
import json
import threading
import time
from pathlib import Path

from .config import report_dir

_locks: dict[str, threading.Lock] = {}


def _lock(report_id: str) -> threading.Lock:
    return _locks.setdefault(report_id, threading.Lock())


def create_report(pet: dict) -> dict:
    from .config import new_report_id
    rid = new_report_id()
    state = {
        "report_id": rid,
        "created_at": time.time(),
        "pet": pet,  # {name, species, description, photo}
        "transcript": None,
        "clips": [],  # {clip_id, filename, label, captured_clock, fps, duration_s, file_id, status, error, tracks}
        "matches": [],  # {clip_id, object_id, still, score, rationale, confirmed}
        "poster": None,
        "next_search": None,
        "matcher_model": None,
    }
    write_state(state)
    return state


def state_path(report_id: str) -> Path:
    return report_dir(report_id) / "state.json"


def read_state(report_id: str) -> dict | None:
    p = state_path(report_id)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def write_state(state: dict) -> None:
    p = state_path(state["report_id"])
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1))
    tmp.replace(p)


def update_state(report_id: str, fn) -> dict:
    with _lock(report_id):
        state = read_state(report_id)
        fn(state)
        write_state(state)
        return state
