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

# Voice first: gentle compression + presence so it reads clearly; music is a quiet bed, carved out of the speech band
# (300 Hz-3 kHz) and ducked hard under speech. Target: music under speech >= 15 LU below the voice.
MUSIC_GAIN = float(__import__('os').environ.get('MUSIC_GAIN', '0.12'))  # Film 3 uses MUSIC_GAIN=0.13 (music-only intro); all films measured >= 15 LU music-under-voice
fc = ('[0:a]aformat=channel_layouts=stereo,acompressor=threshold=0.125:ratio=3:attack=8:release=120:makeup=1.6,'
      'equalizer=f=3200:t=q:w=1.2:g=2.5,asplit=2[vk][vm];'
      '[1:a]atrim=0:%s,volume=%s,equalizer=f=1000:t=q:w=0.6:g=-6,equalizer=f=2500:t=q:w=1:g=-4[mu];'
      '[mu][vk]sidechaincompress=threshold=0.015:ratio=12:attack=12:release=650:makeup=1[duck];'
      '[vm][duck]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,atrim=0:%s[out]') % (dur, MUSIC_GAIN, dur)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', vmaster, '-i', score, '-filter_complex', fc, '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s24le', final], check=True)

def ts(x):
    h, r = divmod(max(0.0, x), 3600); m, s = divmod(r, 60)
    return f'{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}'
with open(srt, 'w') as f:
    for i, c in enumerate(plan['captions'], 1):
        f.write(f"{i}\n{ts(c['s'])} --> {ts(c['e'])}\n{c['text']}\n\n")
print('voice master', vmaster, '| mix', final, '| srt lines', len(plan['captions']))
