# Handoff: Find My Dog, Meta Global AI Developer Hackathon

Written 4 Nov 2026, ~19:00 GMT. Everything needed to finish is in this repo.

**Deadline: 21:00 ET = 02:00 GMT (5 Nov). Submit by 22:00 GMT.** Submission form: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit (answers pre-written in `SUBMISSION.md`). Track: **Indie** (students).

## State right now

| Item | State |
|---|---|
| Product code (`worker/`, `web/`) | Done, on `main`. 12/12 unit tests, mock E2E pass. Includes owner-token access model, read-only demo, SAM Files-API fallback for non-public clip URLs. |
| Production deploy | **Done (18:56 GMT).** Real mode (`"mock":false`), new bundle live, demo report returns 403 on writes, and `node eval/e2e.ts https://find-my-dog.kiritokris.workers.dev` passes in **real mode** (`evidence/logs/e2e-production.txt`). |
| UI redesign (4 Nov, ~23:00 GMT) | Warm pet theme (cream, terracotta, Fredoka/Nunito, MISSING-poster report form) with SAM-style per-track colours on the report page. On `main`; **needs `npm run deploy`** to go live. Landing screenshots in `evidence/img/app-*` are recaptured; the real-model UI captures (`real-0*`, owner-vs-stranger) were replayed from `evidence/real_ui_state.json` into the new UI (`evidence/replay_real_ui.py`, no model calls). Film 1 was re-shot on the new UI as a 180 s cut (`e85449f`); Films 2 and 3 still show the previous blue UI. |
| Evidence (`EVIDENCE.md`, `evidence/`, `eval/results/`) | Done: benchmarks, charts, real-UI screenshots, logs, manifest. |
| Film 1 "The Proof" (180 s) | **Re-shot on the new pet-themed UI** (`e85449f`), one-take narration, passes every QA check. **This is the submission video.** Recorded on a local Worker; optional production re-shoot is P2. |
| Film 2 "Engineering Evidence" (240 s) | **Final delivered to Kris** (passes every QA check). |
| Film 3 "Impossible Made Simple" (60 s ad) | **Final delivered to Kris** (passes every QA check). |
| Narration (ElevenLabs voice `dxT8yYZS41hHdsvjw7XV`) | **Committed** in `production/assets/voice/` (no ElevenLabs key needed unless a line changes). |
| Concept stills (Muse Image) | Committed in `production/assets/concept/`. |
| `11_production_report.md` | **Done** (P3). Live-finals pitch + Q&A sheet in `PITCH.md`. |

## Film 1 v3: slower narration, less "AI demo" styling (prepared 4 Nov ~20:50 GMT, not rendered yet)

> **Superseded.** Film 1 was later re-voiced as one take and re-shot on the new UI as a 180 s cut (`e85449f`). Kept for history.


Kris asked for a re-voice: v2 narration ran at ~196 words/min and sounded rushed. Ready in this repo:
- `production/scripts/film1.json`: scenes 01, 02, 03, 04, 08, 10, 11 trimmed to fit at speed 0.88 (~170 words/min). Every word a visual is cued on is kept. "Running live" was dropped because the take is a recording.
- `production/film1/index.html`: flat background (no glow blobs or grid), plain subtitles (no word-by-word karaoke), no neon glow on the architecture diagram, neutral labels. Footage is untouched.
- `production/revoice_film1.sh`: re-voices with speed 0.88, similarity 0.9, style 0, stops on any overrun, and copies the result into `production/assets/voice/`.

Needs a session whose network allows `api.elevenlabs.io`, `api.meta.ai`, `archive.org`, `*.archive.org`, `fonts.googleapis.com` and `fonts.gstatic.com`. The allowlist change did not reach the session that prepared this. Then:

```bash
bash production/revoice_film1.sh            # needs ELEVENLABS_API_KEY in .env (git-ignored)
FILM1_ONLY=1 bash production/bootstrap.sh   # needs META_API_KEY in .dev.vars; ~45 min; must end with all PASS lines
```

Then listen to the whole film before sending it, check that captions match the speech, and commit `production/assets/voice/01_hackathon_demo_120s/`. If v3 isn't ready in time, **upload v2**: it's valid, just brisk.

## Set up the new environment (5 minutes)

1. Connect GitHub to an account with access to the **private** repo `shahaman098/find-my-dog`; work on `main`.
2. Put the **rotated** Meta key in `.dev.vars` as `META_API_KEY=...`. The tracked `.dev.vars` contains the old, exposed key; overwrite it locally and never commit a key.
3. Only if a narration line must change: add `ELEVENLABS_API_KEY` as an environment secret (not in chat), then `node production/voice.mjs production/scripts/film1.json <scene_id>`.

## Finish the films (one command, ~1 h 30 m, ~$0.60 of Meta calls)

```bash
bash production/bootstrap.sh
```

It: installs deps → copies committed assets → downloads the two Internet Archive clips and re-encodes them → runs the SAM 3.1 privacy pass (people + number plates pixelated) → starts Xvfb and two local Workers (real mode :8788, mock :8787) → records the real terminal sessions → `production/reshoot_all.sh` (shoots one continuous 4K take, records the 403 edge case, renders + QA-gates Film 1, then Films 3 and 2, regenerates docs).

Outputs (git-ignored, send them to Kris as files): `production/out/01_hackathon_demo_180s.mp4`, `02_engineering_evidence_240s.mp4`, `03_cinematic_product_ad_60s.mp4`, `04_demo_voiceover.wav`, `05_advert_voiceover.wav`, `06_demo_subtitles.srt`, `07_advert_subtitles.srt`, `12_raw_evidence/`. Each film must print all `PASS` lines from `production/qa.py` before it is sent.

If only one film needs redoing after a take exists: `SKIP_CAPTURE=1 BASE=http://localhost:8788 bash production/make_film1.sh` (Film 1) or `SKIP_FILM1=1 bash production/render_all.sh` (Films 3, 2).

## Priorities (in order)

- **P0 (Kris):** **redeploy** (`npm run deploy`) so the live site shows the new UI. Rotate Meta + ElevenLabs keys. Make the repo public only after rotating, and after deleting the leftover `claude/*` branches. Muse Code line in `SUBMISSION.md`: kept (confirmed by Kris). Upload Film 1 (unlisted YouTube; check logged-out playback) and submit before the 02:00 GMT deadline (9:00 PM ET). **The 180 s Film 1 on the new UI is the one to upload.**
- **P1:** ✅ done: all three films final and delivered (20:00 GMT). Only re-run `bash production/bootstrap.sh` if the MP4s are lost or a film must change.
- **P2 (optional, after deploy):** re-shoot on production: `BASE=https://find-my-dog.kiritokris.workers.dev bash production/reshoot_all.sh`. If you do, change scene 04 of `production/scripts/film1.json` back to "…a brand-new report on the deployed site…", re-voice that one scene (needs ElevenLabs), and re-render Film 1.
- **P3:** ✅ done: `production/11_production_report.md` and `PITCH.md` (60-second pitch + Q&A for the 9 Nov finals). ✅ "Time-boxed" softened to "scoped to one search" in the README, `SUBMISSION.md`, `PITCH.md` and the landing page (no expiry is enforced in code). Redeploy (`npm run deploy`) so the live landing page picks it up.

## Known pitfalls (each one bit the last session)

- **Never run `npm ci` while a `wrangler dev` is running**: it deletes `node_modules` and the Worker crashes (state in `.wrangler/realstate` survives; just restart it).
- **`pkill -f <pattern>` kills your own shell** when the pattern appears in the command line. Stop processes by PID or process group (`kill -- -<pgid>`); `ss` is not installed.
- **Film 1 QA fails on any frozen stretch > 4 s.** The live-action time map is anchored on real events (`production/build_film1.py`); if a take's waits differ, adjust anchors there, never add slow motion or cuts.
- **CDP screencast cannot do 4K smoothly**; the capture uses headed Chromium on Xvfb `:99` recorded by ffmpeg `x11grab` (Xvfb must be started with `-nocursor`; the cursor is drawn from real input events).
- **SAM needs the clip by public URL or Files API**; locally the Worker uploads to `/v1/files` automatically (`worker/src/meta.ts` `uploadVideo`).
- Honesty rules the films follow (keep them): every footage frame maps to a real take frame; speed is shown on screen; terminal panels replay recorded sessions with literal commands; generated imagery is labelled "concept imagery"; the environment (local vs production) is stated in narration and labels.
