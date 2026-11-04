"""File a real-mode report on a local Worker and seed it with the benchmark's real SAM 3.1 tracks + crops.

SAM needs a public video URL, which a laptop's wrangler dev doesn't have, so tracking ran in eval/benchmark.ts
(file upload) and its tracks are written into the report here. Matching, the plan and the poster then run live
through the product UI (evidence/capture_real_ui.cjs) against the real Meta API.

    npx wrangler dev --port 8788 --local            # real mode: META_API_KEY in .dev.vars
    python3 evidence/seed_real_report.py /tmp http://localhost:8788
    node evidence/capture_real_ui.cjs /tmp evidence/img
"""
import json, subprocess, sys, urllib.request

SP, BASE = sys.argv[1], sys.argv[2]
D = 'eval/fixtures/crops/dogpark'

boundary = 'fmdboundary'
def multipart(fields, files):
    body = b''
    for k, v in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for k, (name, data, ctype) in files.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + data + b'\r\n'
    return body + f'--{boundary}--\r\n'.encode()

req = urllib.request.Request(f'{BASE}/api/reports', method='POST',
    data=multipart({'pet_name': 'Biscuit', 'species': 'dog', 'description': 'Apricot goldendoodle, curly coat, medium-large, floppy ears, red collar. Friendly but scared of traffic.'},
                   {'photo': ('biscuit.jpg', open(f'{D}/t8_f335.jpg', 'rb').read(), 'image/jpeg')}),
    headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
rep = json.load(urllib.request.urlopen(req))
json.dump(rep, open(f'{SP}/report.json', 'w'))
rid, tok = rep['report_id'], rep['owner_token']

def d1(args):
    return subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'findmydog', '--local', *args], capture_output=True, text=True, check=True).stdout

state = json.loads(json.loads(d1(['--json', '--command', f"SELECT state FROM reports WHERE id='{rid}'"]))[0]['results'][0]['state'])
dp = json.load(open('eval/results/dogpark.tracks.json'))['tracks']
dc = json.load(open('eval/results/doorcam.tracks.json'))['tracks']
keep = {8: 't8_f351', 9: 't9_f383', 6: 't6_f241', 14: 't14_f572', 7: 't7_f308', 12: 't12_f442'}

def clip(cid, label, clock, dur, tracks):
    return {'clip_id': cid, 'filename': f'{cid}.mp4', 'label': label, 'captured_clock': clock, 'fps': 10, 'duration_s': dur,
            'media_url': f'{BASE}/api/reports/{rid}/clips/{cid}', 'status': 'done', 'error': None,
            'tracks': tracks, 'n_tracks': len(tracks), 'still_done': True}

state['clips'] = [clip('parkcam01', 'Dog park fountain cam', '5:42 PM', 76, [t for t in dp if t['object_id'] in keep]),
                  clip('elmdoor01', "Neighbour's doorbell, Elm St", '6:18 PM', 32, dc)]
open(f'{SP}/seed.sql', 'w').write(f"UPDATE reports SET state = '{json.dumps(state).replace(chr(39), chr(39) * 2)}' WHERE id = '{rid}';")
d1(['--file', f'{SP}/seed.sql'])

def put(cid, oid, path):
    r = urllib.request.Request(f'{BASE}/api/reports/{rid}/stills/{cid}/{oid}', data=open(path, 'rb').read(), method='PUT', headers={'X-Owner-Token': tok})
    return urllib.request.urlopen(r).status

for oid, f in keep.items():
    assert put('parkcam01', oid, f'{D}/{f}.jpg') == 200
assert put('elmdoor01', 0, 'eval/fixtures/crops/doorcam/t0_f34.jpg') == 200
print('seeded', rid)
