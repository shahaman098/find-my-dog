#!/usr/bin/env bash
# Edge case for the films: a stranger (no owner token) tries to change the owner's decision.
# Every command is printed exactly as it is executed (no paraphrase), then run.
#   bash production/edge_case.sh <base_url> <report_id> <clip_id> <object_id> <demo_report_id>
BASE=$1 RID=$2 CLIP=$3 OBJ=$4 DEMO=$5
run() { printf '$ %s\n' "$1"; bash -c "$1"; echo; }
run "curl -s -w '\nHTTP %{http_code}\n' -X POST $BASE/api/reports/$RID/matches/confirm -H 'X-Owner-Token: guessed' -H 'Content-Type: application/json' -d '{\"clip_id\":\"$CLIP\",\"object_id\":$OBJ,\"confirmed\":false}'"
run "curl -s -w '\nHTTP %{http_code}\n' -X POST $BASE/api/reports/$DEMO/analyze"
run "curl -s $BASE/api/reports/$RID | python3 -c 'import json,sys; print([(m[\"object_id\"], m[\"confirmed\"]) for m in json.load(sys.stdin)[\"matches\"] if m[\"confirmed\"] is not None])'"
