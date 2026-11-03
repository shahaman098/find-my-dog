# CV Submission — pre-drafted answers

**Submit at:** https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit
**Deadline:** Wed Nov 4, 9:00 PM ET · **Target: 5–6 PM ET** (the form has many questions — do not start it at 8:30)

## Checklist before submitting

- [ ] Repo public: `github.com/<user>/find-my-dog` (created Nov 3, event-only history)
- [ ] Live URL: https://find-my-dog.kiritokris.workers.dev (real mode, key set as secret)
- [ ] Demo report seeded at `/#/demo` (visible without any setup)
- [ ] Video ≤ 3:00, hard cut, playable logged-out (YouTube unlisted or plain file URL)
- [ ] Video shows only work built during the event
- [ ] Music: royalty-free license saved to `video/MUSIC-LICENSE.md`
- [ ] Contributor listed: Aman Kumar Sah
- [ ] X demo post link submitted in the form (engagement counts through Nov 8 EOD)
- [ ] Credits claimed individually (card + $150 spend limit) — deadline is the same moment

## Pre-drafted answers

**Project name:** Find My Dog

**One-liner:** When a pet goes missing, Find My Dog turns the neighborhood's cameras into a search party: SAM 3.1 tracks every animal in shared footage with persistent identities, Muse Spark matches them against the owner's photo and description, and the owner gets an evidence-linked sighting timeline, a concrete next-search plan, and a shareable alert poster.

**Problem statement:** Build for Your World — a problem every pet owner knows firsthand.

**Which Meta models does it use at runtime, and where?**
- SAM 3.1 — concept-prompted detection + tracking with persistent IDs across every uploaded clip (the load-bearing perception step)
- Muse Spark 1.3 — (1) appearance matching between the owner's photo and each tracked detection (structured output), (2) an agentic tool loop that decides and records the next-search plan and calls Muse Image for the alert poster
- Muse Voice Transcribe — the owner's panicked voice note becomes the search brief (diarized transcript)
- Muse Image — the shareable/printable alert poster, generated inside Spark's tool loop
- Muse Glimmer (open weights, Apache-2.0) — optional matcher on Baseten; the product falls back to hosted Spark automatically (explain in demo if disabled)
- Muse Code — used to build parts of this project

**What makes it more than a basic integration?** Four models chained where each does what only it can do: SAM's persistent video tracking has no equivalent in any other stack; Spark's structured matching is human-confirmed, never asserted; the coordinator step is a real tool loop, not a hardcoded chain; and the whole pipeline runs on Cloudflare Workers with an itemized cost meter (≈$3/search) shown live.

**Impact:** ~10M pets go missing in the US each year (industry estimate); ASPCA research shows neighborhood search is how 93% of lost dogs come home — but it's manual, slow, and blind. Amazon's Ring Search Party (Feb 2026, dogs returned in 99 cases in 90 days) proved the need — and is Ring-cameras-only, dogs-only, default-on, and alert-only. Find My Dog is the open version: any camera ecosystem, any pet, opt-in and time-boxed by design, with evidence instead of pings.

**Privacy stance (say it before judges ask):** owner-initiated, time-boxed to the search, consented footage only, no person or face identification anywhere in the pipeline — animals are matched by appearance attributes only.

**Technical depth highlights for judges to inspect in the repo:**
- `worker/src/sam.ts` — parser for SAM 3.1's streamed `<Nf>id<|box…|>` grammar → tracks with exact timestamps (frame N at fps f)
- `worker/src/index.ts` — queue-driven pipeline, structured matching with Glimmer→Spark fallback, agentic tool loop
- `eval/gates.ts` — scripted acceptance gates (persistence through occlusion; ≥8/10 match accuracy)
- `eval/e2e.ts` — end-to-end pipeline test, runs against dev and production
- Mock mode (`FMD_MOCK`) — deterministic full-pipeline simulation used for CI-style verification

**X post (demo thread) — draft:**
> She slipped the gate at 6:15pm. By 6:40pm, three doorbell cameras on our street had already seen her — nobody knew it yet. 🐾
> We built Find My Dog: file a report, neighbors share clips from ANY camera, Meta's SAM 3.1 tracks every animal with a persistent ID, Muse Spark matches your photo against every sighting, and you get an evidence-linked timeline + a search plan for the morning.
> No new hardware. No Ring-only walled garden. No face recognition — ever.
> Live demo + code below. #MetaAIHackathon
> [video link] [live product link]
