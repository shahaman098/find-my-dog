# Evidence

Every claim Find My Dog makes, next to the screenshot, chart, raw data and log that backs it.
All real-model numbers come from the **production code path** (`worker/src/sam.ts`, `prompts.ts`, `meta.ts`)
calling the **live Meta API** on 4 Nov 2026. Charts are generated from the raw JSON by
[`evidence/build.py`](evidence/build.py); nothing is typed in by hand.

| # | Claim | Result | Proof |
|---|---|---|---|
| 1 | Muse Spark puts the owner's pet first | **9 / 9** top-ranked (3 dogs × 3 trials, look-alike distractors) | [§1](#1-matching-benchmark-muse-spark), [`match.json`](eval/results/match.json) |
| 2 | Matching is accurate | **92%** of 87 verdicts; recall **93%**; precision **83%** before the owner confirms | [§1](#1-matching-benchmark-muse-spark), [`match_rows.csv`](evidence/data/match_rows.csv) |
| 2b | It holds up in doorbell conditions | right dog still ranked #1 in **15 / 15** degraded case-conditions (night vision, ¼ resolution, motion blur, dusk, all combined; 18 / 18 with the clean baseline); accuracy **86–93%**; worst-case recall **67%** | [§1b](#1b-doorbell-conditions-robustness), [`robustness_rows.csv`](evidence/data/robustness_rows.csv) |
| 3 | No person is ever confirmed as a pet | the person SAM labelled "dog" was **rejected 9 / 9** | [§1](#1-matching-benchmark-muse-spark) |
| 4 | SAM 3.1 keeps identity through an occlusion | **same track ID** after a 1.5 s full-frame blackout | [§2](#2-sam-31-tracking), [`doorcam_occluded.tracks.json`](eval/results/doorcam_occluded.tracks.json) |
| 5 | SAM finds small animals on real doorbell footage | a dog about **50 × 50 px** (median box, 0.3% of the frame) among adults, a child and a stroller; 0 tracks on people | [§2](#2-sam-31-tracking) |
| 6 | It works end to end through the real UI | **21 / 21** Spark verdicts correct over 3 separate real runs; plan + poster generated | [§3](#3-the-product-running-on-real-models) |
| 7 | The coordinator is a real tool loop | Spark itself chose `suggest_next_search` → `make_poster` | [§3](#3-the-product-running-on-real-models), [`plan.json`](eval/results/plan.json) |
| 8 | Only the owner can decide; the demo can't be vandalised | **12 / 12** access checks pass on the real-mode Worker | [§5](#5-access-control-real-mode-worker), [log](evidence/logs/access-control-real.txt) |
| 8b | The deployed site runs the full real pipeline | `node eval/e2e.ts https://find-my-dog.kiritokris.workers.dev` **passes in real mode**: SAM 3.1 tracks, Spark matches, owner confirms, plan + Muse Image poster, demo read-only ($0.04) | [log](evidence/logs/e2e-production.txt) |
| 9 | Build and tests are green | typecheck, 12/12 unit tests, web build, full mock E2E: all exit 0 | [§6](#6-tests-and-build) |

---

## 1. Matching benchmark (Muse Spark)

![Headline numbers](evidence/img/chart-headline.png)

![Confusion matrix](evidence/img/chart-confusion.png)

**Why the owner always sees the right dog first:** rank by match strength (Spark's confidence when it says "match", 0 when it
rejects). In every case-trial, the highest dot is the true pet. All 5 false flags fell between 0.55 and 0.65.

![Separation of match strength](evidence/img/chart-strength.png)

**Why the owner stays in the loop:** an auto-flag threshold would trade recall for precision. The product shows every
candidate sorted by strength and only counts a sighting once the owner confirms it.

![Threshold trade-off](evidence/img/chart-threshold.png)

## 1b. Doorbell conditions (robustness)

Doorbell footage is rarely clean. The same 29 labelled comparisons were re-run through the production matcher with the
**camera crops** degraded to simulate night-vision IR, a distant animal (¼ resolution), a running animal (motion blur),
dusk without IR, and IR + ¼ resolution + blur combined. The owner's reference photo stays clean, as a phone photo
would. One trial per condition, 145 calls, $0.87. Images are generated deterministically by [`eval/degrade.py`](eval/degrade.py).

![Robustness under doorbell conditions](evidence/img/chart-robustness.png)

**What it shows:** the right dog stayed the top-ranked candidate in every case and condition, with every margin strictly
positive. Single degradations cost a few points of accuracy. The combined worst case drops recall to 67% and leaves the
white dog only **+0.05** ahead of the white hound. At night, the owner's confirm step carries real weight, which is
why the product never auto-confirms. One trial per condition is a small sample; treat these as indicative.

### Every comparison, with the animal it was about

Blue border = the owner's pet (ground truth: the same SAM track in the same continuous shot). Orange = a different
animal or a person. Each line is one trial: ✓ = Spark agreed with ground truth.

![Case Biscuit](evidence/img/chart-case-goldendoodle.png)
![Case Miso](evidence/img/chart-case-shiba.png)
![Case Luna](evidence/img/chart-case-white-dog.png)

Raw rows with Spark's full rationale for each verdict: [`evidence/data/match_rows.csv`](evidence/data/match_rows.csv).

## 2. SAM 3.1 tracking

**Small animal, real doorbell camera.** One continuous track for 12.3 s, with no tracks raised on the adults or the child.

![SAM on a doorbell frame](evidence/img/sam-doorbell-detection.jpg)

**Persistence.** The same clip with the whole frame blacked out from 4.0 to 5.5 s. SAM picked the dog up again as
**track #0**: one track, one 1.7 s gap, no new ID.

![Occlusion timeline](evidence/img/chart-sam-occlusion.png)

**Where SAM failed.** On an *edited* 76 s news montage, every track was checked by eye. Inside continuous shots, identities
held. Across hard cuts, most long tracks carried their ID onto a different dog, and one track labelled people "dog".
Doorbell and CCTV footage has no cuts, and the product matches each track's best still independently, with the
owner confirming. This failure is still the main known limitation.

![Montage tracks](evidence/img/chart-sam-montage.png)

All tracks: [`evidence/data/sam_tracks.csv`](evidence/data/sam_tracks.csv) · raw: [`eval/results/*.tracks.json`](eval/results).

## 3. The product, running on real models

A real-mode local Worker with SAM 3.1 tracks from §2 seeded into a report (SAM needs a public video URL that a laptop
doesn't have; see [`evidence/seed_real_report.py`](evidence/seed_real_report.py)). Everything below was generated live
by Muse Spark and Muse Image through the UI ([`evidence/capture_real_ui.cjs`](evidence/capture_real_ui.cjs)).
After the UI redesign, that recorded run ([`real_ui_state.json`](evidence/real_ui_state.json)) was replayed into a local
Worker by [`replay_real_ui.py`](evidence/replay_real_ui.py) and photographed again with the same script (`--replay`), so
these captures show the current UI. No model was called during the replay. The replayed state matches the recording
field for field (verdicts, scores, rationales, owner decisions, plan, summary, tracks, cost). The images are the run's own:
the exact track frames, SAM's doorbell box, and the Muse Image poster cut from the original capture
([`evidence/img/replay/`](evidence/img/replay)).

**Footage in, SAM tracks out:**

![Footage and tracks](evidence/img/real-01-footage-sam-tracks.jpg)

**Spark ranks every tracked animal against the reference photo and explains why.** Biscuit came first. Four other dogs,
a different tan dog on the Elm St doorbell, and the mislabelled person were all rejected. 21 / 21 verdicts were correct
across 3 runs.

![Ranked matches](evidence/img/real-02-spark-match-ranked.jpg)

**After the owner confirms, Spark's tool loop writes the plan and calls Muse Image for the poster:**

![Plan and poster](evidence/img/real-03-spark-plan-muse-poster.jpg)

**The share page for the street:** sighting ribbon, plan, the owner's real photo beside the generated poster, and the
cost meter ($0.06 for this session's matching, plan and poster).

![Share page](evidence/img/real-04-share-page.jpg)

Full console: [`real-00-console-full.jpg`](evidence/img/real-00-console-full.jpg) · final report state:
[`evidence/real_ui_state.json`](evidence/real_ui_state.json) · per-run numbers: [`benchmark-summary.txt`](evidence/logs/benchmark-summary.txt).

## 4. Comparisons

**Poster before and after the safety fix.** The first real run invented a phone number and a reward that an owner could
have printed. The prompt now forbids invented contact details, and the second run left a blank line.

![Poster before vs after](evidence/img/compare-poster-before-after.jpg)

**Owner vs anyone else holding the link.**

![Owner vs stranger](evidence/img/compare-owner-vs-stranger.jpg)

**Ring Search Party vs Find My Dog**, as shown on the landing page with the measured numbers:

![Proof and Ring comparison](evidence/img/app-proof-and-ring-comparison.jpg)

**Landing page:** light, dark and phone.

| Light | Dark | Phone |
|---|---|---|
| ![](evidence/img/app-landing-light.jpg) | ![](evidence/img/app-landing-dark.jpg) | ![](evidence/img/app-landing-phone.png) |

How it works: [`app-how-it-works.jpg`](evidence/img/app-how-it-works.jpg) · full page: [`app-landing-full.jpg`](evidence/img/app-landing-full.jpg).

## 5. Access control (real-mode Worker)

From [`evidence/logs/access-control-real.txt`](evidence/logs/access-control-real.txt), produced by
[`evidence/access_checks.sh`](evidence/access_checks.sh):

```
PASS GET /api/reports/:id never contains the owner token
PASS stranger: run matcher (no token)                    want 403 got 403
PASS stranger: confirm a sighting (wrong token)          want 403 got 403
PASS stranger: generate plan + poster                    want 403 got 403
PASS stranger: delete a neighbour clip                   want 403 got 403
PASS stranger: overwrite a still                         want 403 got 403
PASS owner: confirm with the real token                  want 200 got 200
PASS owner: malformed confirm body rejected              want 400 got 400
PASS anyone: read-only demo refuses analyze              want 403 got 403
PASS anyone: read-only demo refuses new clips            want 403 got 403
PASS anyone: read-only demo refuses delete               want 403 got 403
PASS anyone: clip upload without a file rejected         want 400 got 400
summary: 12 passed, 0 failed
```

## 6. Tests and build

| Check | Log | Result |
|---|---|---|
| Strict TypeScript over the Worker | [`typecheck.txt`](evidence/logs/typecheck.txt) | exit 0 |
| Unit tests (SAM grammar, track merge, clock order, cost meter, image sniffing, public-URL check) | [`unit-tests.txt`](evidence/logs/unit-tests.txt) | 12 / 12 pass |
| Web build | [`web-build.txt`](evidence/logs/web-build.txt) | exit 0 |
| Full pipeline + access model E2E (mock mode) | [`e2e-mock.txt`](evidence/logs/e2e-mock.txt) | PASS |

## 7. Bugs the evidence exposed (all fixed)

| Found by | Bug | Fix |
|---|---|---|
| Real coordinator run | Muse Image **invented a phone number and a reward** on the poster | Prompt forbids invented contacts; blank "Contact:" line (§4) |
| Real coordinator run | Muse Image returns **WebP**, stored and served as PNG | Bytes sniffed (`imageType`, unit-tested) |
| Real UI capture | **"95% · no match"** showed a fuller bar than the real match at 75% (verdict confidence read as match strength) | Cards show match strength; rejections say "not a match · Spark N% sure" |
| Real UI capture | A first fix ranked an **unusable crop (the person) top**, because "no match, low confidence" became 90% | Rank only by positive-verdict strength, as the benchmark measured |
| Real UI capture | Spark rationales were **cut mid-word** at 300 chars | Word-boundary trim at 600 |
| Fixture review | The suggested SAM demo GIF is SAM's **own output with masks painted on** | Replaced with clean real footage |

## 8. Limitations (read before quoting the numbers)

- **Small n:** 3 dogs, 87 comparisons, 1 doorbell clip; the robustness run is 1 trial per condition, with
  degradations *simulated* from daytime footage rather than real night recordings.
- **Reference photos are frames from the same footage**, which is easier than a real owner's phone photo.
- **SAM 3.1 re-identification fails across hard video cuts** (§2). The coordinator reads track spans, so a span that
  crosses a cut can leak into the plan (one plan said "drinking for 38.5 s").
- **83% precision means the owner-confirm step is load-bearing**: the product never auto-confirms.
- Generated posters show an *illustration* of the described dog and can misspell words ("corly"). The share page shows
  the owner's real photo next to it.

## 9. Cost of producing this evidence

| Run | Cost |
|---|---|
| SAM 3.1: montage 760 frames + doorbell 320 + doorbell-occluded 320 | $0.28 |
| Muse Spark matching benchmark: 87 comparisons | $0.48 |
| Real UI sessions: 3 × (7 matches + plan + poster), as metered in-app | $0.15 |
| Coordinator benchmark: 2 runs (plan + poster; not metered, estimated from the in-app meter) | ≈ $0.05 |
| Robustness benchmark: 5 doorbell conditions × 29 comparisons | $0.87 |
| **Total** | **≈ $1.83** |

## 10. Reproduce everything

```bash
export $(grep -v '^#' .dev.vars | xargs)                       # META_API_KEY
# footage: eval/fixtures/README.md (two curl + three ffmpeg commands)
# benchmark: README.md → "Reproduce the results"

npx wrangler dev --port 8788 --local &                          # real mode
python3 evidence/seed_real_report.py /tmp http://localhost:8788
node evidence/capture_real_ui.cjs /tmp evidence/img
bash evidence/access_checks.sh http://localhost:8788 <report_id> <owner_token> <DEMO_REPORT_ID>

python3 eval/degrade.py
for c in night_ir low_res motion_blur dark worst_case; do
  node eval/benchmark.ts match --cases eval/fixtures/cases_$c.json --trials 1 --out eval/results/robust_$c.json
done

# after the UI redesign: re-photograph the recorded real run in the current UI (no model calls)
npx wrangler dev --local --port 8799 --var FMD_MOCK:1 &
python3 evidence/replay_real_ui.py /tmp http://localhost:8799
APP=http://localhost:8799 node evidence/capture_real_ui.cjs /tmp evidence/img --replay

python3 evidence/build.py && node evidence/shoot.cjs http://localhost:8788 && python3 evidence/compose.py
```

**Footage and thumbnails.** The source clips are from the Internet Archive
([`Plymouth_Dog_Parks_-_September_2012`](https://archive.org/details/Plymouth_Dog_Parks_-_September_2012),
[`doorcam-dog_202302`](https://archive.org/details/doorcam-dog_202302)). Neither item states a licence, so the clips are
**not** redistributed. `evidence/img/crops/` holds small thumbnails (≤ 180 px) only so each verdict can be checked
against its animal. Remove that folder if you'd rather not publish them; the charts and numbers don't depend on it.
