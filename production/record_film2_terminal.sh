#!/usr/bin/env bash
# Real terminal sessions for Film 2. Each is recorded with production/term_record.cjs (output + timing, exit code).
#   bash production/record_film2_terminal.sh <report_id>
set -u
cd "$(dirname "$0")/.."
RID=$1
ONLY=" ${*:2} "
T=production/out/12_raw_evidence/terminal
WORKER_LOG=${WORKER_LOG:-production/work/wrangler-real.log}
mkdir -p $T
rec() { local name=$1; shift; [ "$ONLY" != "  " ] && [[ "$ONLY" != *" $name "* ]] && return; SHOW_CMD="$1" node production/term_record.cjs $T/$name.json -- "$1" >/dev/null 2>&1; echo "recorded $name"; }

rec repo        "git log -3 --format='%h %ci %s' | cut -c1-96; echo; ls; echo; sed -n '1,12p' README.md"
rec creds       "cat .dev.vars.example; echo; grep -n 'META_API_KEY\\|BASETEN' worker/src/types.ts"
rec setup       "node --version; npm ls --depth=0 2>/dev/null | head -6; echo; npm run build --prefix web 2>&1 | tail -4"
rec typecheck   "npx tsc -p . && echo 'typecheck: 0 errors'"
# boot a fresh Worker on another port, show its startup lines and the health check, then stop it
rec boot        "setsid npx wrangler dev --port 8790 --local --persist-to .wrangler/bootdemo > /tmp/fmd_boot.log 2>&1 & P=\$!; for i in \$(seq 1 40); do curl -s -m 1 localhost:8790/api/health >/dev/null && break; sleep 1; done; grep -E 'Ready|Your Worker has access|env\\.|Binding' /tmp/fmd_boot.log | grep -v META_API_KEY | head -14; echo; echo '\$ curl localhost:8790/api/health'; curl -s localhost:8790/api/health; echo; kill -- -\$P 2>/dev/null; true"
rec d1          "npx wrangler d1 execute findmydog --local --persist-to .wrangler/realstate --command \"SELECT id, length(state) AS state_bytes, datetime(updated_at/1000,'unixepoch') AS updated FROM reports WHERE id='$RID'\" 2>/dev/null | tail -12"
rec persist     "curl -s localhost:8788/api/reports/$RID | python3 -c 'import json,sys; s=json.load(sys.stdin); print(json.dumps({\"clips\": [(c[\"label\"], c[\"status\"], c[\"n_tracks\"]) for c in s[\"clips\"]], \"confirmed\": [(m[\"object_id\"], m[\"score\"]) for m in s[\"matches\"] if m[\"confirmed\"]], \"plan\": (s[\"next_search\"] or {}).get(\"headline\"), \"poster_url\": s[\"poster_url\"], \"cost_usd\": s[\"cost\"][\"usd\"]}, indent=1))'; echo; curl -s -o /dev/null -w 'GET poster -> %{http_code} %{content_type} %{size_download} bytes\\n' localhost:8788/api/reports/$RID/poster"
rec worker_log  "grep -E 'POST /api/reports|/match|/analyze|/confirm|/timeline' $WORKER_LOG | grep '$RID' | head -12 | cut -c1-110"
rec bench       "sed -n '1,9p' evidence/logs/benchmark-summary.txt; echo; tail -7 evidence/logs/benchmark-summary.txt"
