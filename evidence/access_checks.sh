#!/usr/bin/env bash
# Access-model checks against a running Worker. Prints each request, the expected status and the actual one.
#   bash evidence/access_checks.sh http://localhost:8788 <report_id> <owner_token> <demo_report_id>
set -u
BASE=$1 RID=$2 TOKEN=$3 DEMO=$4
pass=0 fail=0
check() { # name expected curl-args...
  local name=$1 want=$2; shift 2
  local got
  got=$(curl -s -o /tmp/fmd_body -w '%{http_code}' "$@")
  if [ "$got" = "$want" ]; then pass=$((pass+1)); mark=PASS; else fail=$((fail+1)); mark=FAIL; fi
  printf '%-4s %-62s want %s got %s  %s\n' "$mark" "$name" "$want" "$got" "$(head -c 110 /tmp/fmd_body | tr '\n' ' ')"
}
leak=$(curl -s "$BASE/api/reports/$RID" | grep -c "$TOKEN")
if [ "$leak" = "0" ]; then pass=$((pass+1)); echo "PASS GET /api/reports/:id never contains the owner token"; else fail=$((fail+1)); echo "FAIL token leaked in GET"; fi

check 'stranger: run matcher (no token)'                    403 -X POST "$BASE/api/reports/$RID/match"
check 'stranger: confirm a sighting (wrong token)'          403 -X POST -H 'X-Owner-Token: guessed' -H 'Content-Type: application/json' -d '{"clip_id":"parkcam01","object_id":8,"confirmed":true}' "$BASE/api/reports/$RID/matches/confirm"
check 'stranger: generate plan + poster'                    403 -X POST "$BASE/api/reports/$RID/analyze"
check 'stranger: delete a neighbour clip'                   403 -X DELETE "$BASE/api/reports/$RID/clips/parkcam01"
check 'stranger: overwrite a still'                         403 -X PUT --data-binary 'x' "$BASE/api/reports/$RID/stills/parkcam01/8"
check 'owner: confirm with the real token'                  200 -X POST -H "X-Owner-Token: $TOKEN" -H 'Content-Type: application/json' -d '{"clip_id":"parkcam01","object_id":8,"confirmed":true}' "$BASE/api/reports/$RID/matches/confirm"
check 'owner: malformed confirm body rejected'              400 -X POST -H "X-Owner-Token: $TOKEN" -H 'Content-Type: application/json' -d '{"clip_id":1}' "$BASE/api/reports/$RID/matches/confirm"
check 'anyone: read-only demo refuses analyze'              403 -X POST "$BASE/api/reports/$DEMO/analyze"
check 'anyone: read-only demo refuses new clips'            403 -X POST -F file=@/dev/null "$BASE/api/reports/$DEMO/clips"
check 'anyone: read-only demo refuses delete'               403 -X DELETE "$BASE/api/reports/$DEMO/clips/x"
check 'anyone: oversize-free empty clip upload rejected'    400 -X POST -F 'label=x' "$BASE/api/reports/$RID/clips"
echo
echo "summary: $pass passed, $fail failed"
[ "$fail" = 0 ]
