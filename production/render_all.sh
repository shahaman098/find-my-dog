#!/usr/bin/env bash
# Final renders at the current revision, one at a time (renders are CPU-bound): Film 1 v2, Film 3, Film 2.
#   bash production/render_all.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=production/out
TAKE=$OUT/12_raw_evidence/take_01
SECRETS="${SECRETS:-}"

python3 production/build_film1.py $TAKE
python3 production/mix.py production/film1/audio_plan.json $OUT/audio/film1_score.wav 120 $OUT/04_demo_voiceover.wav $OUT/audio/film1_mix.wav $OUT/06_demo_subtitles.srt
node production/render.cjs production/film1/index.html $OUT/audio/film1_video.mp4 --fps 30 --duration 120 --workers 3
ffmpeg -loglevel error -y -i $OUT/audio/film1_video.mp4 -i $OUT/audio/film1_mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart -t 120 $OUT/01_hackathon_demo_120s.mp4
SECRETS="$SECRETS" python3 production/qa.py $OUT/01_hackathon_demo_120s.mp4 --duration 120 --fps 30 --srt $OUT/06_demo_subtitles.srt --script production/scripts/film1.json --scan production/film1 $OUT/12_raw_evidence/terminal || echo "FILM1 QA FAILED"
echo "== FILM 1 DONE"

python3 production/build_film3.py $TAKE
node production/render.cjs production/film3/index.html $OUT/audio/film3_video.mp4 --fps 24 --duration 60 --workers 3
ffmpeg -loglevel error -y -i $OUT/audio/film3_video.mp4 -i $OUT/audio/film3_mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart -t 60 $OUT/03_cinematic_product_ad_60s.mp4
SECRETS="$SECRETS" python3 production/qa.py $OUT/03_cinematic_product_ad_60s.mp4 --duration 60 --fps 24 --srt $OUT/07_advert_subtitles.srt --script production/scripts/film3.json --scan production/film3 || echo "FILM3 QA FAILED"
echo "== FILM 3 DONE"

python3 production/build_film2.py $TAKE
node production/render.cjs production/film2/index.html $OUT/audio/film2_video.mp4 --fps 30 --duration 240 --workers 3
ffmpeg -loglevel error -y -i $OUT/audio/film2_video.mp4 -i $OUT/audio/film2_mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart -t 240 $OUT/02_engineering_evidence_240s.mp4
# Film 2 holds terminal output still while the narrator explains it: allow longer holds than Film 1
SECRETS="$SECRETS" python3 production/qa.py $OUT/02_engineering_evidence_240s.mp4 --duration 240 --fps 30 --srt $OUT/audio/film2_subtitles.srt --script production/scripts/film2.json --scan production/film2 --max-freeze 12 || echo "FILM2 QA FAILED"
echo "== FILM 2 DONE"
