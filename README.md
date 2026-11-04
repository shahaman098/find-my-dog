# Find My Dog 🐾

[![CI](https://github.com/shahaman098/find-my-dog/actions/workflows/ci.yml/badge.svg)](https://github.com/shahaman098/find-my-dog/actions/workflows/ci.yml)

**Your pet is missing. Every camera on your street already filmed the answer.**

Find My Dog is an owner-initiated, consent-first search engine for neighborhood camera
footage. File a report with a photo and a voice note; neighbors share clips from
whatever cameras they have (doorbell cams, home cams, dashcams — any brand); SAM 3.1
tracks every animal with persistent identities; Muse Spark matches them against the
owner's report; the owner confirms; and the system delivers an evidence-linked sighting
timeline, a concrete next-search plan, and a shareable alert poster.

**Problem statement: "Build for Your World"** — Meta Global AI Developer Hackathon 2026.

**Live:** https://find-my-dog.kiritokris.workers.dev

**Judges, in 60 seconds:** open the [live demo](https://find-my-dog.kiritokris.workers.dev/#/demo) → skim
[Real-model results](#real-model-results) (9/9 top-ranked, 92% accuracy, identity held through a blackout) →
read `worker/src/prompts.ts` (every prompt and tool) and `worker/src/index.ts` (the pipeline).

## Why not just Ring Search Party?

Ring's Search Party for Dogs (launched autumn 2025; Amazon reports 99 dogs home in its first 90 days) proved the need — and drew the map of its gaps:

| | Ring Search Party | Find My Dog |
|---|---|---|
| Cameras | Scans Ring outdoor cams, default-on | **Any footage you have or are given** — Ring exports, Nest, CCTV, dashcams |
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

Access model, enforced server-side (`worker/src/index.ts`):

- **Owner token** — issued once when a report is filed, kept on the owner's device, required
  for every decision: matching, confirming, planning, editing or deleting clips. A share link
  or neighbor link alone cannot change anything.
- **Neighbors can only add** — the neighbor link accepts a clip upload, nothing else.
- **Withdrawn footage is deleted** — removing a clip deletes its video and stills from storage.
- **The public demo is read-only** — the seeded report can be viewed, never modified.

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
├─ prompts.ts  every prompt, schema and tool sent to Meta models (shared with the benchmark)
├─ cost.ts     itemized per-report cost meter
├─ clock.ts    "7:42 PM" / "19:42" → chronological sighting order
├─ mock.ts     deterministic full-pipeline simulation (FMD_MOCK=1)
└─ store.ts    D1-backed report state
web/src/       report form (voice → WAV) · clip ingest · track gallery · confirm ·
               neighbor upload page · share page (timeline ribbon + cost + poster)
eval/          benchmark.ts (real-model results) · e2e.ts (full pipeline) · unit.test.ts · gates.ts (legacy)
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

## Tests

```bash
npm test                          # unit: SAM grammar parser, track merging, clock ordering, cost meter
npm run typecheck                 # strict TypeScript over the Worker
node eval/e2e.ts http://localhost:8787   # full pipeline + access model (mock or real mode)
```

The E2E asserts the whole flow — report → clip → SAM tracks → match → confirm → plan → poster —
plus the access model: the owner token is never returned by reads, non-owners get 403,
re-running the matcher keeps confirmations, and the demo report refuses writes.

## Real-model results

Measured on 4 Nov 2026 against the live Meta API with **the production code path**: `eval/benchmark.ts`
imports the Worker's own SAM parser (`worker/src/sam.ts`), prompts (`worker/src/prompts.ts`) and model
clients (`worker/src/meta.ts`). Nothing is mocked. Raw outputs are in [`eval/results/`](eval/results).

| Claim | Result | Evidence |
|---|---|---|
| Muse Spark ranks the right animal first | **9 / 9**: the true pet was the top-scored candidate in every case and trial (3 dogs × 3 trials) | `results/match.json` |
| Match accuracy against look-alike dogs | **92%** (80 / 87) · recall **93%** · precision **83%** before the owner confirms | `results/match.json` |
| A person is never confirmed as a pet | SAM mislabelled one person as "dog"; Spark rejected that crop **9 / 9** times | `results/match.json` |
| SAM 3.1 keeps identity through an occlusion | After a **1.5 s full-frame blackout**, the dog came back as the **same track ID**: 1 track, 1 gap of 1.7 s | `results/doorcam_occluded.tracks.json` |
| SAM finds small animals in real doorbell footage | A dog about **50 × 50 px (0.3% of the frame)** among adults, a child and a stroller: one continuous track for 12.3 s, **0 tracks on people** | `results/doorcam.tracks.json` |
| The coordinator is a real tool loop | Spark chose both tools itself (`suggest_next_search` → `make_poster`) and planned from the actual sighting times | `results/plan.json` |
| Unit cost | SAM **$0.20 / 1,000 frames**; Spark **≈ $0.0055 per comparison** (87 comparisons = $0.48) | all of the above |

**How the matching set was built.** SAM 3.1 tracked every dog in a 76 s dog-park news montage
(16 tracks). The reference photo for each case is a crop of one dog. Positives are crops of the same dog
from later in the same continuous shot. Negatives are the other dogs, chosen to include deliberate look-alikes
(a white hound against a white dog, a tan doodle against a shiba), plus the person SAM mislabelled.
Every identity label was checked by eye. Cases are in [`eval/match_cases.json`](eval/match_cases.json).

**What this does not show (yet).**
- All 5 false positives scored 0.55–0.65, and every top-ranked true match scored ≥ 0.75. Because the owner
  confirms every sighting and cards are sorted by score, a false positive never outranked the real pet. On its
  own, though, 83% precision means the owner confirmation step is load-bearing, not decorative.
- The reference photos are frames from the same footage, which is easier than a real owner's phone photo.
  Small n: 3 dogs, 87 comparisons.
- Across *hard cuts* in the edited montage, SAM sometimes carried one ID onto a different dog. Real camera
  clips have no cuts, and the product never relies on IDs across clips: each track is matched independently.
- Muse Image returns WebP (now served with the right type), and its lettering can misspell ("corly coat").
  The share page shows the owner's real photo next to the generated poster.

Footage is not redistributed (`eval/fixtures/` is git-ignored); [`eval/fixtures/README.md`](eval/fixtures/README.md)
lists the sources and the exact commands to reproduce every number above.

## Reproduce the results

```bash
export $(grep -v '^#' .dev.vars | xargs)        # META_API_KEY
# fetch + re-encode the footage: see eval/fixtures/README.md (two curl + ffmpeg commands)

node eval/benchmark.ts track --clip eval/fixtures/dogpark_10fps.mp4 --fps 10 --out eval/results/dogpark.tracks.json
node eval/benchmark.ts crops --clip eval/fixtures/dogpark_10fps.mp4 --tracks eval/results/dogpark.tracks.json --dir eval/fixtures/crops/dogpark --per 6
node eval/benchmark.ts match --cases eval/match_cases.json --trials 3 --out eval/results/match.json
node eval/benchmark.ts track --clip eval/fixtures/doorcam_occluded.mp4 --fps 10 --out eval/results/doorcam_occluded.tracks.json
node eval/benchmark.ts plan --sightings eval/sightings_sample.json --sighting eval/fixtures/crops/dogpark/t8_f351.jpg \
  --description "Apricot goldendoodle, curly coat, red collar" --out eval/results/plan.json --poster eval/results/poster.webp
```

Total cost of a full run: about **$0.80** (SAM $0.28, Spark matching $0.48, coordinator + poster ≈ $0.04).
`eval/gates.ts` is the original night-one gate script, kept for history. Its suggested fixture (`assets/dog.gif`
from facebookresearch/sam3) is SAM's own *output* with masks painted on, so it is not used for any number above.

## Team

Aman Kumar Sah — Meta Global AI Developer Hackathon, Nov 2026.
