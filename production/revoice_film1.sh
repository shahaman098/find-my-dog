#!/usr/bin/env bash
# Re-voice Film 1 with the slower, closer-to-the-speaker settings, then make it the committed narration.
#   ELEVENLABS_API_KEY in .env (git-ignored), then:  bash production/revoice_film1.sh
# Stops if any scene overruns its window. Never prints the key.
set -euo pipefail
cd "$(dirname "$0")/.."
KEY=$(sed -n 's/^ELEVENLABS_API_KEY=//p' .env 2>/dev/null || true)
[ -n "$KEY" ] || { echo "Put ELEVENLABS_API_KEY=... in .env first"; exit 2; }
export ELEVENLABS_API_KEY="$KEY" EL_SPEED=${EL_SPEED:-0.88} EL_SIMILARITY=${EL_SIMILARITY:-0.9} EL_STYLE=${EL_STYLE:-0} EL_STABILITY=${EL_STABILITY:-0.65}
F=01_hackathon_demo_120s
rm -rf production/out/voice/$F
mkdir -p production/out/voice
node production/voice.mjs production/scripts/film1.json | tee production/out/voice/revoice.log
if grep -q OVERRUN production/out/voice/revoice.log; then echo "A scene overruns: shorten that line or raise EL_SPEED slightly"; exit 1; fi
python3 - <<'PY'
import json
r = json.load(open('production/out/voice/01_hackathon_demo_120s/timing_report.json'))['report']
w = sum(len(json.load(open(f"production/out/voice/01_hackathon_demo_120s/{x['scene']}.words.json"))['words']) for x in r)
d = sum(x['duration'] for x in r)
print(f"pace: {w} words in {d:.1f} s of speech = {w / d * 60:.0f} words/min (v2 was ~196)")
PY
mkdir -p production/assets/voice/$F && cp production/out/voice/$F/* production/assets/voice/$F/
echo "== Film 1 narration re-voiced and copied to production/assets/voice/$F (commit it)"
