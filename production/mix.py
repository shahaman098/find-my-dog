"""Audio assembly + subtitles from one timing source.

    python3 production/mix.py <audio_plan.json> <score.wav> <duration> <voice_master.wav> <final_mix.wav> <subs.srt>

voice master: every narration segment placed at its scene time (48 kHz mono, exact length).
final mix:    voice + score, score side-chain ducked under the voice, loudnorm -16 LUFS / -1 dBTP.
srt:          caption lines from the same word timestamps the film burns in.
"""
import json, subprocess, sys

plan_f, score, dur, vmaster, final, srt = sys.argv[1:7]
dur = float(dur)
plan = json.load(open(plan_f))

ins, filt = [], []
for i, v in enumerate(plan['voice']):
    ins += ['-i', v['file']]
    ms = int(round(v['at'] * 1000))
    filt.append(f'[{i}:a]aresample=48000,adelay={ms}|{ms}[v{i}]')
k = len(plan['voice'])
filt.append(''.join(f'[v{i}]' for i in range(k)) + f'amix=inputs={k}:normalize=0:dropout_transition=0,apad,atrim=0:{dur},alimiter=limit=0.891:level=false[vo]')
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *ins, '-filter_complex', ';'.join(filt), '-map', '[vo]', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s24le', vmaster], check=True)

fc = ('[0:a]aformat=channel_layouts=stereo,asplit=2[vk][vm];'
      '[1:a]atrim=0:%s,volume=0.55[mu];'
      '[mu][vk]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400:makeup=1[duck];'
      '[vm][duck]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.0:LRA=9,aresample=48000,atrim=0:%s[out]') % (dur, dur)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', vmaster, '-i', score, '-filter_complex', fc, '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s24le', final], check=True)

def ts(x):
    h, r = divmod(max(0.0, x), 3600); m, s = divmod(r, 60)
    return f'{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}'
with open(srt, 'w') as f:
    for i, c in enumerate(plan['captions'], 1):
        f.write(f"{i}\n{ts(c['s'])} --> {ts(c['e'])}\n{c['text']}\n\n")
print('voice master', vmaster, '| mix', final, '| srt lines', len(plan['captions']))
