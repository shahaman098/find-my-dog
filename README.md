# Find My Dog 🐾

**Your pet is missing. Every camera on your street already filmed the answer.**

Find My Dog is an owner-initiated, consent-first search engine for neighborhood camera
footage. You file a report with a photo and a voice note; neighbors share clips from
whatever cameras they have (doorbell cams, home cams, dashcams — any brand); SAM 3.1
tracks every animal with persistent identities; Muse Spark decides which one is yours;
you confirm; and the system hands you an evidence-linked sighting timeline, a concrete
next-search plan, and a shareable alert poster.

**Problem statement: "Build for Your World"** — a problem every pet owner knows firsthand.

Built for the Meta Global AI Developer Hackathon 2026.

## Why not just Ring Search Party?

Amazon's Search Party (Feb 2026) proved the need — and drew the map of its gaps:

| | Ring Search Party | Find My Dog |
|---|---|---|
| Cameras | Ring outdoor cams only, default-on | **Any footage you have or are given** — Ring exports, Nest, CCTV, dashcams |
| Pets | Dogs only | **Any pet** — dogs, cats, anything with a photo |
| Consent | Opt-out (default-on scanning) | **Opt-in, owner-initiated, time-boxed** |
| Output | "Possible match" alert | **Evidence-linked sighting timeline + search plan + poster** |

## The Meta stack (all runtime models are Meta)

| Step | Model | Why it's load-bearing |
|---|---|---|
| Track every animal with persistent IDs | **SAM 3.1** | Text-prompted concept tracking across frames — no other stack does this |
| Match owner photo ↔ track stills | **Muse Spark 1.3** (or **Muse Glimmer** open-weights) | Appearance-attribute reasoning over image pairs |
| Voice note → search brief | **Muse Voice Transcribe** | Streaming diarized transcription |
| Alert poster | **Muse Image** | Generated, shareable, printable |
| Search plan | **Spark tool loop** | Spark decides which tools to run and in what order (agentic) |

The matcher runs on **Muse Glimmer via Baseten** (open-weight, Apache-2.0) when a
`BASETEN_API_KEY` is configured, and falls back to hosted Spark otherwise.

## Unit economics

Perception is cheap; reasoning is bounded:

| Step | Volume for a 1-hour neighborhood search | Cost |
|---|---|---|
| SAM 3.1 tracking | 7,200 frames @ 2 fps sampling | ~$1.44 |
| Spark matching | ~50 track stills, one structured call each | <$1.00 |
| Voice + poster | negligible | <$0.50 |
| **Total** | | **≈ $3 / search** |

Clips are re-encoded to 2 fps before SAM (exact timestamps preserved: frame N = N/2 s),
cutting billed frames ~15× vs raw 30 fps footage.

## Privacy stance

Owner-initiated and time-boxed to the search window. Footage is ingested only from
cameras the owner or a consenting neighbor shares. **No person or face identification
exists anywhere in the pipeline** — animals are matched by appearance attributes only.
Confirmed sightings stay on the report; nothing is published automatically.

## Run it

```bash
# 1. Backend (Python 3.12+, ffmpeg on PATH)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # add META_API_KEY from dev.meta.ai
uvicorn api.main:app --reload  # serves API + web build on :8000

# 2. Frontend (only when changing UI)
cd web && npm install && npm run build  # output served by FastAPI
```

Open http://localhost:8000, file a report, upload clips, run the matcher.

## Verify the core claims (gates)

```bash
# G1: SAM 3.1 keeps a persistent track across an occlusion in one clip
python -m eval.gates g1 --clip eval/fixtures/dog_clip.mp4

# G2: Spark matches the right animal from an owner photo, ≥8/10 trials
python -m eval.gates g2 --owner eval/fixtures/owner.jpg \
  --same eval/fixtures/still_a.jpg eval/fixtures/still_b.jpg \
  --different eval/fixtures/other_animal.jpg
```

Fixtures: `dog_clip.mp4` is Meta's own SAM 3 demo asset
([facebookresearch/sam3](https://github.com/facebookresearch/sam3), `assets/dog.gif`);
the distractor photo is from Wikimedia Commons.

## Architecture

```
app/
├─ api/
│  ├─ main.py        FastAPI app; serves web/dist
│  ├─ config.py      env + paths
│  ├─ meta_client.py one OpenAI-SDK client for Spark / SAM 3.1 / Muse Image + ASR endpoint
│  ├─ sam_parse.py   SAM output grammar parser (<Nf>id<|box…|>) → tracks with timestamps
│  ├─ store.py       per-report JSON state (SQLite-free, demo scale)
│  ├─ report.py      create report, voice transcription
│  ├─ ingest.py      clip upload → 2fps re-encode → SAM concept tracking → stills
│  ├─ match.py       structured matching (Glimmer-on-Baseten → Spark fallback) + owner confirm
│  └─ timeline.py    sightings + agentic Spark tool loop (search plan + poster)
├─ web/              Vite + React: report form → clip ingest → confirm → share page
└─ eval/gates.py     G1/G2 gate tests
```

## Team

Aman Kumar Sah — Meta Global AI Developer Hackathon, Nov 2026.
