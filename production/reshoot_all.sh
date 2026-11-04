#!/usr/bin/env bash
# Re-shoot the take and rebuild every film from it, at the current revision.
#   BASE=http://localhost:8788 bash production/reshoot_all.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SECRET=${SECRET_OUT:-/tmp/fmd_take_secret.json}
SECRET_OUT=$SECRET bash production/make_film1.sh                       # capture + edge case + Film 1 + QA
RID=$(python3 -c "import json;print(json.load(open('$SECRET'))['report_id'])")
bash production/record_film2_terminal.sh "$RID" d1 persist worker_log  # report-specific sessions for Film 2
SKIP_FILM1=1 bash production/render_all.sh                            # Film 3, Film 2 + QA
python3 production/docs.py
echo "== ALL DONE"
