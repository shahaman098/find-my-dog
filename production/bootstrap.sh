#!/usr/bin/env bash
# Rebuild everything for the films from a fresh clone, then shoot and render all three.
#   1. put the (rotated) Meta key in .dev.vars:  META_API_KEY=...
#   2. bash production/bootstrap.sh            (~1 h 30 m total; ~$0.60 of Meta API calls)
# Needs: node 22, ffmpeg, Xvfb, Playwright's Chromium (all present in Claude Code cloud containers).
set -euo pipefail
cd "$(dirname "$0")/.."
grep -q '^META_API_KEY=..' .dev.vars || { echo "Put META_API_KEY=<rotated key> in .dev.vars first"; exit 2; }
set -a; . ./.dev.vars; set +a
mkdir -p production/work production/out eval/fixtures/src

echo "== 1/7 dependencies + web build"
npm ci --no-audit --no-fund >/dev/null && npm ci --prefix web --no-audit --no-fund >/dev/null && npm run build --prefix web >/dev/null

echo "== 2/7 committed assets (narration in the cloned voice, concept stills)"
cp -rn production/assets/voice production/out/ 2>/dev/null || cp -r production/assets/voice production/out/
mkdir -p production/out/concept && cp -n production/assets/concept/* production/out/concept/ 2>/dev/null || true

echo "== 3/7 footage (Internet Archive; not redistributed) + 10 fps re-encodes"
[ -s eval/fixtures/src/dogpark.mp4 ] || curl -sL -o eval/fixtures/src/dogpark.mp4 "https://archive.org/download/Plymouth_Dog_Parks_-_September_2012/Plymouth_Dog_Parks_-_September_2012.mp4"
[ -s eval/fixtures/src/doorcam.mp4 ] || curl -sL -o eval/fixtures/src/doorcam.mp4 "https://archive.org/download/doorcam-dog_202302/bad-dog.mp4"
[ -s eval/fixtures/dogpark_10fps.mp4 ] || ffmpeg -loglevel error -y -i eval/fixtures/src/dogpark.mp4 -vf "fps=10,scale=640:-2" -an -c:v libx264 -pix_fmt yuv420p eval/fixtures/dogpark_10fps.mp4
[ -s eval/fixtures/doorcam_10fps.mp4 ] || ffmpeg -loglevel error -y -i eval/fixtures/src/doorcam.mp4 -vf "fps=10,scale=720:-2" -an -c:v libx264 -pix_fmt yuv420p eval/fixtures/doorcam_10fps.mp4
[ -s production/work/fountain_10fps.mp4 ] || ffmpeg -loglevel error -y -ss 33.6 -to 39.0 -i eval/fixtures/dogpark_10fps.mp4 -c:v libx264 -pix_fmt yuv420p -an -movflags +faststart production/work/fountain_10fps.mp4

echo "== 4/7 privacy pass: SAM 3.1 finds people + number plates, every box pixelated"
if [ ! -s production/work/doorcam_blurred.mp4 ]; then
  node eval/benchmark.ts track --clip eval/fixtures/doorcam_10fps.mp4 --fps 10 --concept person --out production/work/doorcam.person.tracks.json
  node eval/benchmark.ts track --clip eval/fixtures/doorcam_10fps.mp4 --fps 10 --concept "license plate" --out production/work/doorcam.plate.tracks.json
  python3 production/blur_people.py eval/fixtures/doorcam_10fps.mp4 production/work/doorcam_blurred.mp4 production/work/doorcam.person.tracks.json production/work/doorcam.plate.tracks.json
fi

echo "== 5/7 local Workers: real mode :8788 (films), mock :8787 (E2E recording); virtual 4K display"
pgrep -x Xvfb >/dev/null || (Xvfb :99 -screen 0 3840x2160x24 -nolisten tcp -nocursor >/dev/null 2>&1 &)
curl -s -m 2 localhost:8788/api/health >/dev/null || (setsid npx wrangler dev --var DEMO_REPORT_ID:939e4286bf7b --port 8788 --local --persist-to .wrangler/realstate >> production/work/wrangler-real.log 2>&1 &)
curl -s -m 2 localhost:8787/api/health >/dev/null || (setsid npx wrangler dev --var FMD_MOCK:1 --var DEMO_REPORT_ID:aaaaaaaaaaaa --port 8787 --local --persist-to .wrangler/mockstate > production/work/wrangler-mock.log 2>&1 &)
for i in $(seq 1 60); do curl -s -m 2 localhost:8788/api/health | grep -q '"mock":false' && curl -s -m 2 localhost:8787/api/health >/dev/null && break; sleep 2; done
[ -s eval/fixtures/pet.jpg ] || cp production/assets/owner_reference.jpg eval/fixtures/pet.jpg
[ -s eval/fixtures/dog_clip.mp4 ] || cp production/work/fountain_10fps.mp4 eval/fixtures/dog_clip.mp4

echo "== 6/7 real terminal sessions (unit tests, E2E, repo, setup, boot, ...) at this revision"
T=production/out/12_raw_evidence/terminal; mkdir -p $T
node production/term_record.cjs $T/npm_test.json -- npm test >/dev/null 2>&1
SHOW_CMD="node eval/e2e.ts http://localhost:8787" node production/term_record.cjs $T/e2e_mock.json -- node eval/e2e.ts http://localhost:8787 >/dev/null 2>&1
bash production/record_film2_terminal.sh none repo creds setup typecheck boot bench

echo "== 7/7 shoot the take + render and QA Films 1, 3, 2 (production/reshoot_all.sh)"
SECRETS="$META_API_KEY" BASE=http://localhost:8788 bash production/reshoot_all.sh
ls -la production/out/0*.mp4
