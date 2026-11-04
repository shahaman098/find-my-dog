# Live finals: 60-second pitch and Q&A sheet

For the closing ceremony on **9 Nov**. Every number below comes from `EVIDENCE.md`. If a judge asks for one that isn't here, say "it's not in our evidence pack" rather than estimating.

## The 60-second pitch (~150 words, read at a calm pace)

> When a dog slips the gate, the first hour matters, and the clues are already out there: on the doorbells and cameras up and down the street. Today, finding them means knocking on doors and asking neighbours to scrub through footage.
>
> **Find My Dog** turns that footage into a search party. Neighbours share clips from *any* camera. **SAM 3.1** tracks every animal with a persistent ID. **Muse Spark** compares each one with the owner's photo and explains why. The owner, never the model, confirms the match. Then Spark's tool loop writes a search plan and calls **Muse Image** for a poster.
>
> And we measured it on real footage. The right dog ranked first **nine times out of nine** against look-alikes, and still first in **15 of 15** simulated doorbell conditions. SAM held the dog's identity through a full blackout. No face recognition, ever.
>
> It's live, it's open source, and every claim has its evidence in the repo.

**Show on screen while speaking:** `https://find-my-dog.kiritokris.workers.dev/#/demo` (read-only demo report: no setup, can't be vandalised). Backup: Film 1 (180 s, current UI) muted, or Film 3 (60 s; it shows the earlier blue UI).

## Live demo plan (if you get more than 60 s)

1. Open `/#/demo` and show the sighting ribbon, ranked matches with Spark's reasons, the plan and the poster beside the real photo.
2. Point at the cost meter: a search session costs cents, and a 1-hour neighbourhood search stays under ~$3 (unit-tested).
3. Point out that the share page has **no decision controls** for anyone without the owner token. "Only the owner's device can decide. Even a direct API call gets a 403." (Film 1's edge-case scene shows the 403s.)
4. Don't run a fresh real search live unless the Wi-Fi is solid. SAM plus Spark plus Image takes about 3 minutes end to end (take timings in `production/10_script_and_timeline.md`). Film 1 shows exactly that run.

## Q&A

### "Isn't this just Ring Search Party?"
Ring proved people want this. Amazon says it brought 99 dogs home in its first 90 days. But Ring searches **Ring cameras only, for dogs only**, and it's **on by default** and **alerts only**. Most streets have a mix of Ring, Nest, CCTV, dashcams and phones. We take footage from any of them, for any pet, opt-in, and we return **ranked evidence with reasons, a timeline, a plan and a poster** instead of a ping. And it's open source with its benchmark in the repo.

### "What about Petco Love Lost?"
*(Check their current feature set before the finals.)* As we understand it, Petco Love Lost matches photos of lost pets against photos that shelters and finders upload, so it works **once someone has already found or photographed the pet**. We work **before that**: the pet is wandering, nobody has picked it up, but cameras have seen it. The two complement each other. A confirmed sighting from us is exactly what an owner should post there.

### "Privacy: you're scanning neighbourhood cameras?"
No. Nothing is scanned that a neighbour didn't choose to share for this one search.
- **Opt-in, owner-initiated.** Neighbours upload specific clips. There's no camera integration and no background scanning.
- **No person identification anywhere.** We only ask SAM for animals, and Spark only compares animal appearance. When SAM mislabelled a person as "dog", Spark **rejected it 9 / 9 times**, and the owner-confirm step is a second guard.
- **Enforced in code:** only the owner token can run matching, confirm or delete. Anyone else with the link can only add clips, and a withdrawn clip is **deleted from storage**, not hidden (12 / 12 access checks, `evidence/logs/access-control-real.txt`).
- **Our own footage:** every person and number plate in our films was pixelated by a SAM 3.1 pass before upload.
- **Retention, said honestly.** The README, the submission and the landing page now say "scoped to one search", not "time-boxed": **automatic expiry is not in the code yet**. Reports stay indefinitely (there is no delete-report route), and clips stay until the owner withdraws them. Say: "Searches are scoped to one report, and owners can withdraw any clip. Automatic expiry after the search is next on our list." Don't claim it's enforced.

### "Where does SAM fail?"
Across **hard cuts in edited video**. On a 76 s news montage, track IDs carried across cuts onto different dogs, and one track labelled people "dog". Inside continuous shots, identities held. Doorbell and CCTV footage has no cuts, and we match each track's best still independently with the owner confirming. It's our main known limitation, and it's documented with a chart in `EVIDENCE.md` §2.

### "How accurate is it, really?"
- 92% of 87 verdicts correct, 93% recall, **83% precision**. That's why the owner confirms every match: the model alone isn't enough.
- Right dog top-ranked **9 / 9** (3 dogs × 3 trials, look-alike distractors), and **15 / 15** (18 / 18 with the clean baseline) under simulated night IR, ¼ resolution, motion blur, dusk and all combined. The worst case drops recall to 67%.
- **Be upfront about the limits:** small n, simulated degradations, and reference photos cropped from the same footage, which is easier than a real owner's phone photo.

### "Why do you need four models?"
Each does something the others can't. **SAM 3.1** gives persistent video tracking, so one dog across 12 s is one candidate, not 300 frames. **Spark** gives structured, explainable matching and a real tool loop: it chose `suggest_next_search` then `make_poster` itself. **Muse Image** makes the poster. **Voice Transcribe** turns a panicked voice note into the search brief. **Glimmer** (open weights) is an optional matcher; production runs on hosted Spark and falls back automatically.

### "What does it cost?"
Our production E2E search cost **$0.044**. A real UI session (7 matches + plan + poster) cost about **$0.05**. The cost meter shows a 1-hour neighbourhood search stays under **~$3**, and that's unit-tested. Producing all of our evidence cost **≈ $1.83**.

### "Did it catch real bugs?"
Yes, and we fixed them. The poster model **invented a phone number and a reward** an owner could have printed (the prompt now forbids invented contacts). Muse Image returned **WebP labelled as PNG** (we now sniff the bytes). The UI showed a "95% · no match" bar fuller than a real 75% match. All of them are in `EVIDENCE.md` §7.

### "Was the demo video faked or sped up?"
It's sped up and labelled, never faked. Film 1 is one continuous take with no cuts. Every compressed stretch shows its speed and the real elapsed time on screen. Terminal panels replay recorded sessions. The take was recorded on a local Worker running the same commit against the live Meta API, and the film says so. The deployed site passes the same end-to-end test in real mode (`evidence/logs/e2e-production.txt`).

### "What's next?"
1. Automatic expiry of reports and clips after the search window.
2. Real owner phone photos and real night footage in the benchmark.
3. Cut detection before tracking, to stop IDs leaking across edits.
4. One-tap clip sharing from the common camera apps' export flows.

## Before going on stage

- [ ] `/#/demo` loads on the venue Wi-Fi (and on phone data as a backup)
- [ ] Film 3 is downloaded locally, not streamed
- [ ] The Meta key has been rotated and the repo is public (otherwise judges can't open `EVIDENCE.md`)
- [x] The "time-boxed" wording is fixed (now "scoped to one search"; see Privacy above)
