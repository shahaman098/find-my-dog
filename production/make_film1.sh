#!/usr/bin/env bash
# Film 1 end to end, after `npm run deploy`:  bash production/make_film1.sh
# capture (production) -> edge-case terminal recording (production) -> timeline -> render -> mix -> mux -> QA
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=${BASE:-https://find-my-dog.kiritokris.workers.dev}
DEMO_ID=${DEMO_ID:-939e4286bf7b}
TAKE=production/out/12_raw_evidence/take_01
SECRET=${SECRET_OUT:-/tmp/fmd_take_secret.json}
OUT=production/out
# length and score cues come from the script: duration, reveal = scene 03 start, end = scene 11 start
read D REVEAL END < <(python3 -c "import json;d=json.load(open('production/scripts/film1.json'));S={s['id']:s for s in d['scenes']};print(d['duration'],S['03_reveal']['start'],S['11_close']['start'])")
FILM=$OUT/01_hackathon_demo_${D}s.mp4

if [ "${SKIP_CAPTURE:-0}" != 1 ]; then
  pgrep -x Xvfb >/dev/null || (Xvfb :99 -screen 0 3840x2160x24 -nolisten tcp -nocursor >/dev/null 2>&1 &)
  sleep 1
  rm -rf "$TAKE"; mkdir -p "$TAKE"
  DISPLAY=:99 SECRET_OUT="$SECRET" node production/capture_prod.cjs "$BASE" "$TAKE" | tee "$TAKE/capture.log"
fi

RID=$(python3 -c "import json;print(json.load(open('$SECRET'))['report_id'])")
TOKEN=$(python3 -c "import json;print(json.load(open('$SECRET'))['owner_token'])")
CLIP=$(python3 -c "import json;s=json.load(open('$TAKE/final_state.json'));m=[x for x in s['matches'] if x['confirmed']] or s['matches'];print(m[0]['clip_id'])")
OBJ=$(python3 -c "import json;s=json.load(open('$TAKE/final_state.json'));m=[x for x in s['matches'] if x['confirmed']] or s['matches'];print(m[0]['object_id'])")

# edge case: a stranger (no / wrong token) tries to change the decision; then prove nothing changed.
# production/edge_case.sh prints each command exactly as executed.
REDACT="$TOKEN" SHOW_CMD="bash production/edge_case.sh   # stranger tries to change the owner's decision" \
  node production/term_record.cjs $OUT/12_raw_evidence/terminal/access_prod.json -- bash production/edge_case.sh "$BASE" "$RID" "$CLIP" "$OBJ" "$DEMO_ID"

python3 production/build_film1.py "$TAKE"
[ -f $OUT/audio/film1_score_${D}_${REVEAL}_${END}.wav ] || { mkdir -p $OUT/audio; python3 production/score.py $OUT/audio/film1_score_${D}_${REVEAL}_${END}.wav --duration $D --reveal $REVEAL --end $END; }
python3 production/mix.py production/film1/audio_plan.json $OUT/audio/film1_score_${D}_${REVEAL}_${END}.wav $D $OUT/04_demo_voiceover.wav $OUT/audio/film1_mix.wav $OUT/06_demo_subtitles.srt
node production/render.cjs production/film1/index.html $OUT/audio/film1_video.mp4 --fps 30 --duration $D --workers 3
ffmpeg -loglevel error -y -i $OUT/audio/film1_video.mp4 -i $OUT/audio/film1_mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart -t $D $FILM
SECRETS="$TOKEN,$(sed -n 's/^ELEVENLABS_API_KEY=//p' .env 2>/dev/null),$(sed -n 's/^META_API_KEY=//p' .dev.vars)" \
  python3 production/qa.py $FILM --duration $D --fps 30 --srt $OUT/06_demo_subtitles.srt --script production/scripts/film1.json --scan production/film1 $OUT/12_raw_evidence/terminal
