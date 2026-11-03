# Find My Dog 🐾

**Your pet is missing. Every camera on your street already filmed the answer.**

Find My Dog is an owner-initiated, consent-first search engine for neighborhood camera
footage. File a report with a photo and a voice note; neighbors share clips from
whatever cameras they have (doorbell cams, home cams, dashcams — any brand); SAM 3.1
tracks every animal with persistent identities; Muse Spark matches them against the
owner's report; the owner confirms; and the system delivers an evidence-linked sighting
timeline, a concrete next-search plan, and a shareable alert poster.

**Problem statement: "Build for Your World"** — Meta Global AI Developer Hackathon 2026.

**Live:** https://find-my-dog.kiritokris.workers.dev

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
| Track every animal with persistent IDs | **SAM 3.1** | Text-prompted concept tracking across frames — no equivalent in any other stack |
| Match owner photo ↔ track stills | **Muse Spark 1.3** (or **Muse Glimmer** open-weights on Baseten) | Appearance-attribute reasoning, structured output, human-confirmed |
| Voice note → search brief | **Muse Voice Transcribe** | Diarized transcription of the owner's report |
| Alert poster | **Muse Image** | Generated inside Spark's tool loop |
| Search coordination | **Spark tool loop** | Spark decides which tools to run and in what order |

## Unit economics

| Step | 1-hour neighborhood search | Cost |
|---|---|---|
| SAM 3.1 tracking | ~7,200 frames @ 30fps clips | ~$1.44 |
| Spark matching | ~50 track stills, one structured call each | <$1.00 |
| Voice + poster | negligible | <$0.50 |
| **Total** | | **≈ $3 / search** — shown live by the in-app cost meter |

## Privacy stance

Owner-initiated and time-boxed to the search window. Footage is ingested only from
cameras the owner or a consenting neighbor shares. **No person or face identification
exists anywhere in the pipeline** — animals are matched by appearance attributes only.

## Architecture

Cloudflare Workers (TypeScript + Hono), D1 (state), R2 (media), Queues (pipeline),
Vite + React SPA. No ffmpeg anywhere: SAM receives the clip URL directly, and the
browser encodes WAV for ASR and crops detection stills client-side.

```
worker/src/
├─ index.ts    routes + queue consumer (SAM tracking pipeline)
├─ meta.ts     Meta API clients: SAM stream, Spark structured, Glimmer/Baseten, ASR, Muse Image
├─ sam.ts      SAM output grammar parser (<Nf>id<|box…|>) → tracks with timestamps
├─ analyze     agentic Spark tool loop: suggest_next_search + make_poster  (in index.ts)
├─ cost.ts     itemized per-report cost meter
├─ mock.ts     deterministic full-pipeline simulation (FMD_MOCK=1)
└─ store.ts    D1-backed report state
web/src/       report form (voice → WAV) · clip ingest · track gallery · confirm ·
               neighbor upload page · share page (timeline ribbon + cost + poster)
eval/          gates.ts (G1 persistence / G2 match accuracy) · e2e.ts (full pipeline)
```

## Run it

```bash
npm install
cd web && npm install && npm run build && cd ..   # SPA served by the Worker
cp .dev.vars.example .dev.vars                    # add META_API_KEY from dev.meta.ai
npx wrangler dev                                  # http://localhost:8787
```

Deploy: `npm run deploy` (provisions R2/D1/Queue automatically).

Without a `META_API_KEY` the Worker runs in **mock mode** — the full pipeline works
deterministically so the product is always demonstrable.

## Verify the core claims (gates)

```bash
export $(grep -v '^#' .dev.vars | xargs)

# G1: SAM 3.1 keeps a persistent track through an occlusion in one clip
node eval/gates.ts g1 --clip eval/fixtures/dog_clip.mp4 --fps 3

# G2: Spark matches the right animal from an owner photo, ≥8/10 trials
node eval/gates.ts g2 --owner eval/fixtures/owner.jpg \
  --same eval/fixtures/still_a.jpg eval/fixtures/still_b.jpg \
  --different eval/fixtures/other_animal.jpg

# Full pipeline E2E (dev or deployed URL)
node eval/e2e.ts http://localhost:8787
```

Fixtures: `dog_clip.mp4` is Meta's own SAM 3 demo asset
([facebookresearch/sam3](https://github.com/facebookresearch/sam3), `assets/dog.gif`);
the distractor photo is from Wikimedia Commons.

## Team

Aman Kumar Sah · Umang Sharma · Caleb Carr — Meta Global AI Developer Hackathon, Nov 2026.
