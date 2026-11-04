# Script and timeline: Film 1 "The Proof" (120 s)
Locked narration (`production/scripts/film1.json`), voiced with ElevenLabs voice `dxT8yYZS41hHdsvjw7XV` (eleven_multilingual_v2; stability 0.65, similarity 0.85, style 0.15, speed 1.0; 48 kHz). Every time below is generated from the voice word timings and the capture event log. Source revision `99b7aa8`; take `production/out/12_raw_evidence/take_01` against `http://localhost:8788`.
**Lock history:** scene 04 originally said "on the deployed site". The production deploy was not available in time, so the take was recorded on a local Worker running the same commit against the live Meta API, and the line was re-locked to say exactly that. No other line changed.

## 01_hook · 0:00.00–0:08.00
**Narration** (0.50–7.00 s): What if every camera on your street could help bring a lost dog home, without anyone scrubbing through hours of footage?
**Visual / evidence:** Final share page from the take (push-in) → reverse playback of the same take → the two blurred input clips → before/after split.

## 02_problem · 0:08.00–0:18.00
**Narration** (8.35–16.01 s): Today, that means knocking on doors, posting in group chats, and asking neighbours to rewind video. Ring can search Ring cameras. Most streets have a mix.
**Visual / evidence:** Typographic illustration (labelled "illustration"): three manual steps, Ring vs a real street, ASPCA 2012 statistic with source.

## 03_reveal · 0:18.00–0:28.00
**Narration** (18.35–25.78 s): This is Find My Dog. It searches footage from any camera, for any pet, with the owner in control. Here's the real app, running live.
**Visual / evidence:** Logo, then a still of the landing page from the take, with the recorded URL badge.

## 04_clean_state · 0:28.00–0:40.00
**Narration** (28.35–38.20 s): I'm starting a brand-new report on a local Worker running this exact code against the live Meta API. Health reports real models, not mock mode, and nothing is preloaded.
**Visual / evidence:** Take frames from the health page to the empty form; health-check panel; "what this proves" panel.
**Time map (no cuts):** film 28.00–31.20 s ← take 1.00–5.80 s (1.50×); film 31.20–40.00 s ← take 5.80–15.03 s (1.05×)

## 05_live_action · 0:40.00–0:56.00
**Narration** (40.35–47.90 s): I add Biscuit's photo and a description, then upload two neighbour clips: a dog park and a doorbell. SAM 3.1 tracks every animal in each one.
**Visual / evidence:** One continuous take, piecewise time map anchored on real events; on-screen speed + real elapsed time.
**Time map (no cuts):** film 40.00–41.22 s ← take 15.03–29.70 s (12.02×); film 41.22–42.85 s ← take 29.70–47.67 s (11.05×); film 42.85–45.62 s ← take 47.67–74.13 s (9.54×); film 45.62–48.38 s ← take 74.13–74.13 s (hold); film 48.38–56.00 s ← take 74.13–81.75 s (1.00×)

## 06_process · 0:56.00–1:10.00
**Narration** (56.35–66.13 s): Each clip goes onto a Cloudflare queue. The Worker sends it to SAM 3.1, then Muse Spark compares every tracked animal with Biscuit's photo. This is the real request and response.
**Visual / evidence:** Same take beside the HAR request log of the take; rows light at their recorded times; Spark response excerpt.
**Time map (no cuts):** film 56.00–70.00 s ← take 96.05–121.61 s (1.83×)

## 07_result · 1:10.00–1:22.00
**Narration** (70.35–79.22 s): Biscuit ranks first, with Spark's reasons. I confirm her, and Spark's tool loop writes a search plan and calls Muse Image for a poster. Reloading proves it's stored.
**Visual / evidence:** Same take: ranked matches → confirm → plan + poster → share page reload; stored-state panel from the HAR.
**Time map (no cuts):** film 70.00–72.43 s ← take 121.61–141.28 s (8.10×); film 72.43–74.06 s ← take 141.28–155.83 s (8.89×); film 74.06–76.73 s ← take 155.83–197.40 s (15.57×); film 76.73–77.48 s ← take 197.40–227.01 s (39.80×); film 77.48–77.70 s ← take 227.01–227.01 s (hold); film 77.70–82.00 s ← take 227.01–231.31 s (1.00×)

## 08_architecture · 1:22.00–1:34.00
**Narration** (82.35–91.82 s): Under the hood: a React app, a Cloudflare Worker, D1 for state, R2 for media, and a queue for tracking. Our key decision: the owner confirms every match, never the model.
**Visual / evidence:** Architecture SVG (08_architecture_diagram.svg); nodes highlight on the words naming them.

## 09_tests · 1:34.00–1:45.00
**Narration** (94.35–101.73 s): These are real runs: unit tests, an end-to-end test, and a benchmark on real footage where the right dog ranked first nine times out of nine.
**Visual / evidence:** Recorded terminal sessions replayed at recorded speed (unit tests, mock E2E) + benchmark chart.

## 10_edge_case · 1:45.00–1:55.00
**Narration** (105.35–112.45 s): Edge case: someone with only the share link tries to confirm a sighting. The server refuses with a 403, and nothing changes.
**Visual / evidence:** Stranger view (no owner token) still + recorded terminal session of the 403s (production/edge_case.sh).

## 11_close · 1:55.00–2:00.00
**Narration** (115.35–118.28 s): The evidence is in the repo. This is Find My Dog.
**Visual / evidence:** Logo, tagline, repo / EVIDENCE.md / app URL.

## Take events (seconds into `screen_take.mp4`)

| event | t |
|---|---|
| deploy_verified | -2.17 |
| screen_recording_started | 0.00 |
| health_page | 0.70 |
| health | 3.65 |
| landing | 5.60 |
| typed_name | 17.53 |
| typed_description | 29.93 |
| photo_attached | 30.00 |
| report_form | 33.79 |
| submit_report | 43.41 |
| report_created | 44.62 |
| clips_selected | 48.27 |
| clip_cards_visible | 49.11 |
| clocks_set | 73.63 |
| tracking_done | 79.75 |
| tracks | 83.64 |
| match_clicked | 97.55 |
| matches_visible | 120.61 |
| matches | 127.44 |
| confirmed_top | 141.68 |
| analyze_clicked | 156.13 |
| poster_visible | 197.00 |
| plan | 203.83 |
| poster | 209.38 |
| share_opened | 225.06 |
| share_reloaded | 227.81 |
| share | 232.27 |
| share_scrolled | 236.76 |
| screen_recording_stopped | 236.88 |
| stranger_view | 242.92 |

## Captions

Burned in from the same word timings, and exported as `06_demo_subtitles.srt` (no overlapping lines; QA-checked).

# Film 2 "Engineering Evidence" (240 s): locked narration

The master prompt's locked narration, verbatim. The only placeholder pair was filled from EVIDENCE.md §8: `[REAL_DESIGN_DECISION]` → "owner-confirmed matching", `[VERIFIED_REASON]` → "the matcher is eighty-three percent precise, so its verdict alone is not enough, and a person makes the final call".

**01_reproducibility · 0:00.00–0:30.00:** Let's examine the implementation. This is the actual repository and the source revision used for the demonstration. I'll show how the application starts, how its components communicate, and how we validate its behaviour. Where external credentials are required, the configuration documents what is needed without exposing secrets.

**02_boot_health · 0:30.00–1:00.00:** We start with the documented setup process, launch the required services, and verify they are reachable. The terminal output is from the recorded environment. The health checks establish which components are available before we begin the user workflow.

**03_end_to_end · 1:00.00–1:30.00:** Now we execute the primary user journey from its initial state. We submit the real input, trigger the application action, and observe the result. This sequence preserves the actual execution order, including loading and processing states, so the outcome can be independently understood.

**04_code_architecture · 1:30.00–2:00.00:** This is where the implementation lives. The client calls the relevant service, and the service executes the core workflow. These highlighted functions correspond to the request we just performed. The engineering trade-off behind owner-confirmed matching is that the matcher is eighty-three percent precise, so its verdict alone is not enough, and a person makes the final call.

**05_api_data · 2:00.00–2:30.00:** Here is the request as it travels through the system. We can inspect the actual API response, match it to the relevant logs, and verify the resulting data or artefact. Sensitive fields have been redacted, but the fields needed to understand the behaviour remain visible.

**06_data_lifecycle · 2:30.00–3:00.00:** We also verify what happens after the first result appears. Depending on the workflow, that includes persistence, retrieval, refresh behaviour, or downstream integration. This demonstrates that the visible outcome is backed by real application state, not merely a temporary interface animation.

**07_tests_measurement · 3:00.00–3:30.00:** Next, we run the available automated checks and review their results. We distinguish passing tests, failing tests, and functionality that still needs coverage. Any performance numbers are reported with their test conditions and measurement source, rather than presented as unsupported claims.

**08_failure_limits · 3:30.00–4:00.00:** Finally, we examine an error condition and how the application responds. We also identify the current limitations, third-party dependencies, and what remains unfinished. The repository, setup instructions, and underlying recordings provide the supporting evidence for this demonstration.

# Film 3 "The Impossible Made Simple" (60 s, 24 fps): locked narration

Template placeholders filled from verified facts. Two template lines were adapted, openly: **02_friction:** Template 'Every day, [TARGET_USER] loses time to [PRIMARY_PROBLEM].' filled as written. **03_cost:** Template 'One small task becomes a hundred decisions. And the important work has to wait.' adapted to the lost-pet story (disclosed). **06_engine:** Template line shortened to fit its 10 s window; claims limited to verified behaviour (disclosed).

**01_interruption · 0:00.00–0:05.00:** [silence]

**02_friction · 0:05.00–0:12.00:** Every day, pet owners lose precious hours to a dog that slipped the gate.

**03_cost · 0:12.00–0:20.00:** One lost dog becomes a hundred doorbells to knock on. And every hour, she gets further away.

**04_turn · 0:20.00–0:30.00:** Then the question changes. What if the complicated part simply happened?

**05_reveal · 0:30.00–0:40.00:** Meet Find My Dog. Two neighbours' clips become a ranked match, while you stay in control.

**06_engine · 0:40.00–0:50.00:** Behind that moment, SAM 3.1 tracks every animal, and Muse Spark matches on appearance. Not magic. Working software.

**07_human · 0:50.00–0:56.00:** So you can get back to the walk home.

**08_end · 0:56.00–1:00.00:** Find My Dog. Bring them home.

Visual sources: Muse Image concept stills (production/concept_images.mjs, prompts saved beside each image), marked "concept imagery" on screen; real product footage from take_01 (marked "real product footage · time-compressed"); the engine sequence animates only components in 08_architecture_diagram.svg; the result card is the take's own 4K still of the ranked matches.
