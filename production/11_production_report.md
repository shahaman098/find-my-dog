# Production report: the three Find My Dog films

Covers how Films 1–3 were made, the QA gate each one passed, what that gate caught, and what the films disclose. Companion documents: `08_architecture_diagram.svg`, `09_evidence_manifest.md` (claim → evidence), `10_script_and_timeline.md` (narration, time maps, take events).

Source revision for the take and the final renders: `fbeb8df` (Film 1, Film 3) and `ff51bd0` (Film 2). All three films were final and delivered at 20:00 GMT on 4 Nov 2026.

## Deliverables

| File | Length | Video | Audio | Subtitles | Purpose |
|---|---|---|---|---|---|
| `01_hackathon_demo_120s.mp4` "The Proof" | 120 s | 3840×2160, 30 fps | AAC 320 kb/s, 48 kHz | `06_demo_subtitles.srt` | **The submission video** (upload this one) |
| `02_engineering_evidence_240s.mp4` "Engineering Evidence" | 240 s | 3840×2160, 30 fps | AAC 320 kb/s, 48 kHz | `film2_subtitles.srt` | Technical appendix for judges who want depth |
| `03_cinematic_product_ad_60s.mp4` "Impossible Made Simple" | 60 s | 3840×2160, 24 fps | AAC 320 kb/s, 48 kHz | `07_advert_subtitles.srt` | Short ad for social / the live finals |
| `04_demo_voiceover.wav`, `05_advert_voiceover.wav` | – | – | 48 kHz voice masters | – | Clean narration stems |
| `12_raw_evidence/` | – | – | – | – | The unedited take, HAR, event log, terminal recordings |

The MP4s and `12_raw_evidence/` are git-ignored (`production/out/`) and were sent to Kris as files. `bash production/bootstrap.sh` rebuilds all of them from a fresh clone (~1 h 30 min, ~$0.60 of Meta calls); committed narration and concept stills mean no ElevenLabs or image calls are needed.

## Pipeline

```
blur_people.py      SAM 3.1 finds people + number plates → per-frame pixelation, before any upload
capture_prod.cjs    one continuous 4K take: headed Chromium on Xvfb :99, ffmpeg x11grab, HAR + event log
edge_case.sh        the 403 edge case, every command printed exactly as executed
term_record.cjs     real terminal sessions (npm test, mock E2E, access checks) with timing
build_film{1,2,3}   deterministic timelines; footage frames map 1:1 to take frames
voice.mjs           ElevenLabs narration per scene + word timings (committed in assets/voice/)
render.cjs          parallel 4K frame renderer (3 workers)
score.py / mix.py   original procedural score; voice-first mix, -16 LUFS target, -1 dBTP ceiling; SRT from word timings
qa.py               the gate (below); a film is not sent unless every line is PASS
docs.py             regenerates 09 and 10 from the same data the films use
```

## QA gate

`production/qa.py` checks every film and exits non-zero on any failure:

| Check | Film 1 | Film 2 | Film 3 |
|---|---|---|---|
| Duration within ±1 frame | 120 s | 240 s | 60 s |
| Resolution | 3840×2160 | 3840×2160 | 3840×2160 |
| Frame rate | 30 | 30 | 24 |
| Audio 48 kHz | ✓ | ✓ | ✓ |
| True peak ≤ -0.9 dBFS | ✓ | ✓ | ✓ |
| No black stretch > 0.5 s outside allowed ranges | none allowed | none allowed | intentional black opening and end card allowed (`--allow-black`) |
| No frozen stretch longer than | **4 s** | 12 s (terminal output held while it is explained) | 4 s |
| SRT: no overlaps, ends inside the film, no `[PLACEHOLDERS]` | ✓ | ✓ | ✓ |
| Script has no `[PLACEHOLDERS]` | ✓ | ✓ | ✓ |
| Secret scan (`SECRETS` env) over film sources and terminal recordings | ✓ | ✓ | ✓ |

All three final renders printed only `PASS` lines (the commands are in `production/render_all.sh`). The raw QA printouts lived in `production/out/` in the previous container and were not committed; re-running `render_all.sh` reproduces them.

The `--allow-black` range used for the delivered Film 3 was passed by hand and not recorded. `render_all.sh` now passes `--allow-black 0-5,56-60`: the iris opening (`01_interruption`) and the end card (`08_end`) scene windows from `scripts/film3.json`. Black anywhere else still fails. Film 3 has not been re-rendered with this exact range yet.

### What the gate caught, and the fixes

| Film | QA failure | Fix (commit) |
|---|---|---|
| 1 | Frozen stretch > 4 s while waiting for SAM: the word "SAM" was anchored to clip upload, not to when tracking began | Anchor moved to `clip_cards_visible`, the real start of tracking. No cuts, no slow motion (`b1d8c29`) |
| 3 | Held UI frame read as frozen | Slow camera push kept on the held UI; real frames unchanged (`fbeb8df`) |
| 3 | Intentional black opening and end card failed the black check | `qa.py --allow-black` for named ranges only, so any other black still fails (`fbeb8df`) |
| 2 | Held evidence panels read as frozen | Slow camera push across evidence scenes (`ff51bd0`) |

### Other measured fixes before final

- **Narration buried under music.** Music sat only ~2.6 LU below the voice. The voice-first remix (music -13 dB, speech-band cut, harder ducking, voice presence) measured 16.4 / 15.2 / 15.7 LU of separation for Films 1 / 2 / 3 (`d5cad5e`).
- **Cursor.** Headless automation does not move the OS cursor. The capture now draws a real-style arrow / hand / I-beam taken from the page's CSS, driven by the real input events (`81b859e`).
- **Scene 04 narration re-locked.** It originally said "on the deployed site". The take was recorded on a local Worker (same commit, live Meta API), so the line was changed to say that. No other line changed (`88634bb`).

### Narration fit

Every scene's voice line fits its window (from `assets/voice/*/timing_report.json`):

| Film | Voice speed | Tightest scene | Slack |
|---|---|---|---|
| 1 | 1.00 | `04_clean_state` (re-voiced) 9.85 s in 12 s | 2.15 s |
| 2 | 0.97 | `04_code_architecture` 19.69 s in 30 s | 10.31 s |
| 3 | 0.92 | `06_engine` 7.34 s in 10 s | 2.66 s |

## Honesty rules the films follow

1. Every footage frame maps to a real frame of the one continuous take. Time compression is shown on screen as a speed and a real elapsed clock, and it never goes slower than real time. There are no cuts inside the take.
2. Terminal panels replay recorded sessions at recorded speed, with the literal commands.
3. Generated imagery is labelled. The poster is Muse Image output from inside the product. Film 3's stills are Muse Image concept art, each marked "concept imagery".
4. The recording environment is stated in the narration and labels: a local Worker in real mode, not the production URL.
5. Every person and number plate in the footage is pixelated by a SAM 3.1 pass before upload.
6. The music is original (procedural score). There is no third-party audio.

Full disclosures: `09_evidence_manifest.md` → Disclosures.

## The take (Film 1 source)

One continuous recording, `take_01`, against `http://localhost:8788` in real mode (health: `mock: false`, `matcher: spark`):

| Step | Take time | Evidence |
|---|---|---|
| Report `b04372290430` created | 43.2 s | event log |
| SAM 3.1: dog park done (2 tracks), doorbell done (1 track) | 60.9 s / 76.8 s | HAR polling |
| Muse Spark match | 97.8 → 109.8 s (11.8 s request) | HAR `POST …/match` 200 |
| Biscuit ranked first, owner confirms | 129.3 s | `final_state.json` (score 0.72) |
| Spark tool loop: `suggest_next_search` → `make_poster` | 145.2 → 202.5 s | HAR `POST …/analyze` 200 |
| Reload shows stored timeline, plan, poster | after 202.5 s | HAR `GET …/timeline` |

The production deploy came later (18:56 GMT). `node eval/e2e.ts https://find-my-dog.kiritokris.workers.dev` passes in real mode against the same code ($0.044; `evidence/logs/e2e-production.txt`). A production re-shoot is optional (HANDOFF P2).

## Checks at this revision

Re-run on 4 Nov 2026 at 20:15 GMT in a fresh container:

- `npm test`: 12 / 12 pass (`evidence/logs/unit-tests.txt`)
- `npm run build --prefix web`: exit 0 (`evidence/logs/web-build.txt`)

## Known limitations of the films

- Film 1 shows a local Worker rather than the production URL. This is stated on screen and in the narration.
- The reference photo is a crop from the same dog-park footage, which makes matching easier than a real owner's phone photo (EVIDENCE.md §8).
- Film 2's narration is deliberately generic ("the relevant service") and leans on the on-screen code, logs and HAR for specifics.
- The footage is from Internet Archive items with no stated licence. It appears pixelated in the films and is not redistributed in the repo.
