# Fixtures

Footage is **not committed** (this folder is git-ignored). Only derived numbers live in `eval/results/`.

## Sources

| File | Source | Licence | Used for |
|---|---|---|---|
| `src/dogpark.mp4` | Internet Archive: [`Plymouth_Dog_Parks_-_September_2012`](https://archive.org/details/Plymouth_Dog_Parks_-_September_2012) (NWCTV community news, 76 s) | not stated on the item; used for evaluation only, not redistributed | SAM tracking across many dogs; matching benchmark crops |
| `src/doorcam.mp4` | Internet Archive: [`doorcam-dog_202302`](https://archive.org/details/doorcam-dog_202302) (doorbell camera, 32 s) | not stated on the item; used for evaluation only, not redistributed | small-animal detection; occlusion test |
| `pet.jpg`, `dog_clip.mp4` | synthesised by CI (`ffmpeg -f lavfi …`) | n/a | mock-mode E2E only |

## Recreate

```bash
mkdir -p eval/fixtures/src
curl -L -o eval/fixtures/src/dogpark.mp4 "https://archive.org/download/Plymouth_Dog_Parks_-_September_2012/Plymouth_Dog_Parks_-_September_2012.mp4"
curl -L -o eval/fixtures/src/doorcam.mp4 "https://archive.org/download/doorcam-dog_202302/bad-dog.mp4"

# 10 fps H.264: cheaper SAM runs (billed per frame), same content
ffmpeg -i eval/fixtures/src/dogpark.mp4 -vf "fps=10,scale=640:-2" -an -c:v libx264 -pix_fmt yuv420p eval/fixtures/dogpark_10fps.mp4
ffmpeg -i eval/fixtures/src/doorcam.mp4 -vf "fps=10,scale=720:-2" -an -c:v libx264 -pix_fmt yuv420p eval/fixtures/doorcam_10fps.mp4

# controlled occlusion: the whole frame goes black from 4.0 s to 5.5 s
ffmpeg -i eval/fixtures/doorcam_10fps.mp4 -vf "drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,4,5.5)'" \
  -c:v libx264 -pix_fmt yuv420p eval/fixtures/doorcam_occluded.mp4
```

SAM track IDs are assigned per run; if a re-run numbers the dogs differently, rebuild
`eval/match_cases.json` from the new crops. Check every identity label by eye, as the original set was.

For the mock E2E (`eval/e2e.ts`), any small JPEG at `pet.jpg` and any short MP4 at `dog_clip.mp4` work.
