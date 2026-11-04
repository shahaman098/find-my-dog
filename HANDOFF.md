# Handoff: Find My Dog, Meta Global AI Developer Hackathon

Written 4 Nov 2026, ~19:00 GMT, at the end of a Claude Code session that ran out of credits. Everything needed to finish is in this repo; nothing depends on the old container.

**Deadline: 21:00 ET = 02:00 GMT (5 Nov). Submit by 22:00 GMT.** Submission form: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit (answers pre-written in `SUBMISSION.md`). Track: **Indie** (students).

## State right now

| Item | State |
|---|---|
| Product code (`worker/`, `web/`) | Done, on `main`. 12/12 unit tests, mock E2E pass. Includes owner-token access model, read-only demo, SAM Files-API fallback for non-public clip URLs. |
| Production deploy | **Done (18:56 GMT).** Real mode (`"mock":false`), new bundle live, demo report returns 403 on writes, and `node eval/e2e.ts https://find-my-dog.kiritokris.workers.dev` passes in **real mode** (`evidence/logs/e2e-production.txt`). |
| Evidence (`EVIDENCE.md`, `evidence/`, `eval/results/`) | Done: benchmarks, charts, real-UI screenshots, logs, manifest. |
| Film 1 "The Proof" (120 s) | **v2 delivered to Kris** (passes every QA check: real-style cursor, voice-first mix, 12-test panel). Recorded on a local Worker; optional production re-shoot is P2. |
| Film 2 "Engineering Evidence" (240 s) | **Final delivered to Kris** (passes every QA check). |
| Film 3 "Impossible Made Simple" (60 s ad) | **Final delivered to Kris** (passes every QA check). |
| Narration (ElevenLabs voice `dxT8yYZS41hHdsvjw7XV`) | **Committed** in `production/assets/voice/` (no ElevenLabs key needed unless a line changes). |
| Concept stills (Muse Image) | Committed in `production/assets/concept/`. |
| `11_production_report.md` | Not written yet (P3). |

## Set up the new environment (5 minutes)

1. Connect GitHub to an account with access to the **private** repo `shahaman098/find-my-dog`; work on branch `claude/brave-darwin-9r9p3b` (or `main`; both are at the same commit).
2. Put the **rotated** Meta key in `.dev.vars` as `META_API_KEY=...`. The tracked `.dev.vars` contains the old, exposed key; overwrite it locally and never commit a key.
3. Only if a narration line must change: add `ELEVENLABS_API_KEY` as an environment secret (not in chat), then `node production/voice.mjs production/scripts/film1.json <scene_id>`.

## Finish the films (one command, ~1 h 30 m, ~$0.60 of Meta calls)

```bash
bash production/bootstrap.sh
```

It: installs deps → copies committed assets → downloads the two Internet Archive clips and re-encodes them → runs the SAM 3.1 privacy pass (people + number plates pixelated) → starts Xvfb and two local Workers (real mode :8788, mock :8787) → records the real terminal sessions → `production/reshoot_all.sh` (shoots one continuous 4K take, records the 403 edge case, renders + QA-gates Film 1, then Films 3 and 2, regenerates docs).

Outputs (git-ignored, send them to Kris as files): `production/out/01_hackathon_demo_120s.mp4`, `02_engineering_evidence_240s.mp4`, `03_cinematic_product_ad_60s.mp4`, `04_demo_voiceover.wav`, `05_advert_voiceover.wav`, `06_demo_subtitles.srt`, `07_advert_subtitles.srt`, `12_raw_evidence/`. Each film must print all `PASS` lines from `production/qa.py` before it is sent.

If only one film needs redoing after a take exists: `SKIP_CAPTURE=1 BASE=http://localhost:8788 bash production/make_film1.sh` (Film 1) or `SKIP_FILM1=1 bash production/render_all.sh` (Films 3, 2).

## Priorities (in order)

- **P0 (Kris):** deploy ✅ done. Rotate Meta + ElevenLabs keys. Make the repo public only after rotating. Remove the "Muse Code" line in `SUBMISSION.md` unless true. Upload Film 1 (unlisted YouTube; check logged-out playback) and submit by 22:00 GMT. **Film 1 v2 is the one to upload.**
- **P1:** ✅ done: all three films final and delivered (20:00 GMT). Only re-run `bash production/bootstrap.sh` if the MP4s are lost or a film must change.
- **P2 (optional, after deploy):** re-shoot on production: `BASE=https://find-my-dog.kiritokris.workers.dev bash production/reshoot_all.sh`. If you do, change scene 04 of `production/scripts/film1.json` back to "…a brand-new report on the deployed site…", re-voice that one scene (needs ElevenLabs), and re-render Film 1.
- **P3:** write `production/11_production_report.md` from the QA output and `production/09_evidence_manifest.md`; a 60-second live pitch + Q&A sheet (Ring, Petco Love Lost, privacy, SAM failures) for the 9 Nov live finals.

## Known pitfalls (each one bit the last session)

- **Never run `npm ci` while a `wrangler dev` is running**: it deletes `node_modules` and the Worker crashes (state in `.wrangler/realstate` survives; just restart it).
- **`pkill -f <pattern>` kills your own shell** when the pattern appears in the command line. Stop processes by PID or process group (`kill -- -<pgid>`); `ss` is not installed.
- **Film 1 QA fails on any frozen stretch > 4 s.** The live-action time map is anchored on real events (`production/build_film1.py`); if a take's waits differ, adjust anchors there, never add slow motion or cuts.
- **CDP screencast cannot do 4K smoothly**; the capture uses headed Chromium on Xvfb `:99` recorded by ffmpeg `x11grab` (Xvfb must be started with `-nocursor`; the cursor is drawn from real input events).
- **SAM needs the clip by public URL or Files API**; locally the Worker uploads to `/v1/files` automatically (`worker/src/meta.ts` `uploadVideo`).
- Honesty rules the films follow (keep them): every footage frame maps to a real take frame; speed is shown on screen; terminal panels replay recorded sessions with literal commands; generated imagery is labelled "concept imagery"; the environment (local vs production) is stated in narration and labels.

## Copy-paste prompt for the new Claude Code session

```text
Read HANDOFF.md in this repo first and follow it. Context: Meta Global AI Developer Hackathon submission "Find My Dog", deadline 02:00 GMT 5 Nov. The product, evidence pack and film tooling are done and committed. Your job: (1) check .dev.vars has a META_API_KEY (I will add the rotated key myself; never print it), (2) run `bash production/bootstrap.sh` in the background, (3) watch its output; when each film passes every PASS line of production/qa.py, send me the MP4 (and its SRT), Film 1 first, then Film 3, then Film 2, (4) commit and push any script changes to claude/brave-darwin-9r9p3b and main (never commit keys or anything under production/out or production/work), (5) then write production/11_production_report.md. Follow the "Known pitfalls" section exactly. Use UK English and be concise.
```
