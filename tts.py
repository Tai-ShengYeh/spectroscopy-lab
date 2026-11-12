import asyncio
import json
import os
import subprocess
import sys

import edge_tts

BASE = os.path.dirname(os.path.abspath(__file__))
VOICE = os.environ.get("TTS_VOICE", "zh-TW-HsiaoChenNeural")
RATE = "-4%"


async def synth(text, path):
    for attempt in range(1, 4):
        try:
            await edge_tts.Communicate(text, voice=VOICE, rate=RATE).save(path)
            if os.path.getsize(path) > 0:
                return True
        except Exception as e:
            print(f"retry {attempt} {os.path.basename(path)}: {e!r}", file=sys.stderr)
        await asyncio.sleep(1)
    return False


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True).stdout.strip()
    return round(float(out), 2)


async def main():
    with open(os.path.join(BASE, "narration.json"), encoding="utf-8") as f:
        data = json.load(f)
    outdir = os.path.join(BASE, "audio")
    os.makedirs(outdir, exist_ok=True)
    failed = []
    for gid, items in data.items():
        for i, item in enumerate(items):
            p = os.path.join(outdir, f"{gid}_{i}.mp3")
            ok = await synth(item["say"], p)
            print(("ok  " if ok else "FAIL"), gid, i)
            if not ok:
                failed.append(f"{gid}_{i}")
    if failed:
        print("FAILED:", failed)
        sys.exit(1)
    durs = {gid: [duration(os.path.join(outdir, f"{gid}_{i}.mp3")) for i in range(len(items))]
            for gid, items in data.items()}
    with open(os.path.join(outdir, "durations.json"), "w", encoding="utf-8") as f:
        json.dump(durs, f)
    print(json.dumps(durs))


asyncio.run(main())
