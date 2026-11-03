"""FastAPI app: API routers + the built frontend (web/dist)."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import APP_ROOT
from .report import router as report_router
from .ingest import router as ingest_router
from .match import router as match_router
from .timeline import router as timeline_router

app = FastAPI(title="Find My Dog", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(report_router)
app.include_router(ingest_router)
app.include_router(match_router)
app.include_router(timeline_router)


@app.get("/api/health")
def health():
    from .config import META_API_KEY
    return {"ok": True, "key_configured": bool(META_API_KEY)}


DIST = APP_ROOT / "web" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
