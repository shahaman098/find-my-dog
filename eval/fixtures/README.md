# Fixtures

Fixtures are not committed (repo stays source-only); acquire them to run the gates:

- **`dog_clip.mp4`** — Meta's own SAM 3 demo asset: download
  [`assets/dog.gif`](https://github.com/facebookresearch/sam3/blob/main/assets/dog.gif)
  from `facebookresearch/sam3` and convert to mp4, e.g.
  `ffmpeg -i dog.gif -movflags +faststart dog_clip.mp4` (≈30 s at 30 fps).
- **`owner.jpg`** — a clear photo of the same dog (the gif's subject).
- **`still_a.jpg`, `still_b.jpg`** — two distinct frames of that dog, cropped.
- **`other_animal.jpg`** — a different animal (distractor; our copy is from Wikimedia Commons).

`g1` needs only `dog_clip.mp4`; `g2` needs `owner.jpg`, the two `still_*.jpg`, and `other_animal.jpg`.
