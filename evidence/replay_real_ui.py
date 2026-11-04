"""Replay the recorded real-model run through the current UI, without calling any model.

The real run on 4 Nov (evidence/capture_real_ui.cjs against the live Meta API) saved its final report state to
evidence/real_ui_state.json: SAM 3.1 tracks, all 7 Muse Spark verdicts with their rationales, the Spark plan and
summary, and the metered cost. After the UI redesign, this script loads that recorded state, unchanged, into a
local Worker so the same real outputs can be photographed in the current UI.

Images used are the real ones from that run, already in this repo:
  - track stills: evidence/img/crops/dogpark_<track>_<frame>.jpg (the exact frames the real run used; <= 180 px)
  - doorbell still: evidence/img/replay/doorbell_t0_f34.jpg, frame 3.4 s inside SAM's box, cut from
    evidence/img/sam-doorbell-detection.jpg (number plate blurred)
  - pet photo: production/assets/owner_reference.jpg (frame t8_f335, as in the real run)
  - poster: evidence/img/replay/muse-image-poster.png, the real run's Muse Image poster, cut from the original
    plan screenshot (the full-size file was not kept)

Only the owner's confirm/reject clicks are replayed through the UI; those call no model.

    npx wrangler dev --local --port 8799 --var FMD_MOCK:1 &
    python3 evidence/replay_real_ui.py <scratch_dir> http://localhost:8799
    node evidence/capture_real_ui.cjs <scratch_dir> evidence/img --replay
"""
import copy, json, subprocess, sys, urllib.request

SP, BASE = sys.argv[1], sys.argv[2]
REC = json.load(open('evidence/real_ui_state.json'))
boundary = 'fmdboundary'


def multipart(fields, files):
    body = b''
    for k, v in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for k, (name, data, ctype) in files.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + data + b'\r\n'
    return body + f'--{boundary}--\r\n'.encode()


req = urllib.request.Request(f'{BASE}/api/reports', method='POST',
    data=multipart({'pet_name': REC['pet']['name'], 'species': REC['pet']['species'], 'description': REC['pet']['description']},
                   {'photo': ('biscuit.jpg', open('production/assets/owner_reference.jpg', 'rb').read(), 'image/jpeg')}),
    headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
rep = json.load(urllib.request.urlopen(req))
json.dump(rep, open(f'{SP}/report.json', 'w'))
rid, tok = rep['report_id'], rep['owner_token']


def wr(*args):
    return subprocess.run(['npx', 'wrangler', *args, '--local'], capture_output=True, text=True, check=True).stdout


state = json.loads(json.loads(wr('d1', 'execute', 'findmydog', '--json', '--command', f"SELECT state FROM reports WHERE id='{rid}'"))[0]['results'][0]['state'])
keep_photo = state['pet']['photo_key']
new = copy.deepcopy(REC)
new['report_id'], new['created_at'] = rid, state['created_at']
new['pet']['photo_key'] = keep_photo
for c in new['clips']:
    c['media_url'] = f"{BASE}/api/reports/{rid}/clips/{c['clip_id']}"
for m in new['matches']:
    m['confirmed'] = None          # the owner's decisions are replayed through the UI
new['poster_key'] = f'{rid}/poster'
for k in ('photo_url', 'poster_url', 'demo'):
    new.pop(k, None)
open(f'{SP}/replay.sql', 'w').write(f"UPDATE reports SET state = '{json.dumps(new).replace(chr(39), chr(39) * 2)}' WHERE id = '{rid}';")
wr('d1', 'execute', 'findmydog', '--file', f'{SP}/replay.sql')


def put(cid, oid, path):
    r = urllib.request.Request(f'{BASE}/api/reports/{rid}/stills/{cid}/{oid}', data=open(path, 'rb').read(), method='PUT', headers={'X-Owner-Token': tok})
    return urllib.request.urlopen(r).status


stills = {8: 't8_f351', 9: 't9_f383', 6: 't6_f241', 14: 't14_f572', 7: 't7_f308', 12: 't12_f442'}   # as in seed_real_report.py
for oid, f in stills.items():
    assert put('parkcam01', oid, f'evidence/img/crops/dogpark_{f}.jpg') == 200
assert put('elmdoor01', 0, 'evidence/img/replay/doorbell_t0_f34.jpg') == 200
wr('r2', 'object', 'put', f'findmydog-media/{rid}/poster', '--file', 'evidence/img/replay/muse-image-poster.png', '--content-type', 'image/png')
print('replayed', rid)
