# Demo video — 3:00 script (hard cut at 3:00, sped-up footage allowed)

Record on the **live URL** (real mode). Screen-capture at 1440p; phone footage clips are self-filmed (rights-clean). Music: royalty-free, license saved.

| Beat | Time | On screen | Voiceover |
|---|---|---|---|
| 1. Gone | 0:00–0:20 | Phone shot: empty garden gate, then the app's report form | "This evening, Biscuit slipped her collar and vanished. Every camera on our street probably saw her. Ring can search Ring cameras, but lost dogs don't care what brand of camera saw them." |
| 2. The report | 0:20–0:40 | Fill the form: name, description, photo; record a 5s voice note; show the live transcript | "File a report: a photo, a description — and a voice note. Meta's Voice Transcribe turns the panic into a search brief." |
| 3. The street's cameras | 0:40–1:10 | Drag in 3 clips (front door, driveway, neighbor's cam); set clock times; show SAM tracking live on one | "No new hardware. Any camera works — Ring, Nest, a dashcam, whatever a neighbor will share. SAM 3.1 watches every clip and tracks every animal with a persistent identity — even when a car blocks the view for a few seconds." |
| 4. Is one of them her? | 1:10–1:45 | Run matcher; cards appear sorted by score with rationale; click "That's Biscuit" on the top card | "Muse Spark compares the owner's photo against every tracked animal by coat, build and markings, and explains its reasoning. On real footage against look-alike dogs, the right dog came out on top nine times out of nine. The owner still confirms: evidence, not certainty." |
| 5. The plan | 1:45–2:20 | Timeline ribbon fills; Spark's search plan appears (window, area, why, steps) | "Confirmed sightings become a timeline. Then Spark acts as search coordinator — it decides what to do next: where, when, and why. Dogs return to familiar places at dawn; the plan says exactly that." |
| 6. The poster + share | 2:20–2:45 | Muse Image poster appears; open the share page; show the neighbor invite link | "And the alert spreads itself: a generated poster, a share page for the street, an invite link neighbors can drop their own clips into." |
| 7. Why we win | 2:45–3:00 | Scroll the landing page: the four measured numbers, then the Ring-vs-Find My Dog table; end on the cost meter | "Measured, not claimed: nine out of nine, identity held through a blackout, and no person ever confirmed as a pet. Ring built this for one camera brand. We built it for every street and every pet, opt-in by design, for about three dollars a search." |

## Shot list (self-filmed clips)

- 3 "camera angles" of the same dog (team member's dog or a friend's): porch door, driveway, sidewalk
- One clip where the dog walks behind a bush/car for ~3s (occlusion — proves persistent IDs)
- One evening/night clip
- 1080p, H.264 ("Most Compatible" on iPhone), 10–30s each
- Record 3:42pm-style clocks so the ribbon spreads naturally

## Non-negotiables

- Record on the **deployed latest code**, in real mode. Never show mock output as real.
- The occlusion moment (dog behind a car or bush, same track number after) is the single most convincing shot: get it on camera.
- Show the poster's blank "Contact:" line and say it's deliberate: the model is not allowed to invent a phone number.

## Fallbacks

- If SAM tracking looks slow live: the clip is already processed — show the gallery, narrate over it (sped-up footage allowed)
- If the live API errors on camera: `FMD_MOCK` build remains deployed as a visual fallback; narrate honestly ("mock replay") and prefer cutting to the repo
