# -*- coding: utf-8 -*-
"""Assemble src/ + narration.json + audio/*.mp3 into a single offline index.html.

Usage:  python build.py
Source of truth: src/style.css, src/body.html, src/app.js, narration.json, audio/
Do NOT hand-edit index.html; edit the sources and rebuild.
"""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).parent
src = ROOT / "src"

narr = json.loads((ROOT / "narration.json").read_text(encoding="utf-8"))
dur_file = ROOT / "audio" / "durations.json"
dur = json.loads(dur_file.read_text(encoding="utf-8")) if dur_file.exists() else {}

audio = {}
missing = []
for key, steps in narr.items():
    audio[key] = []
    for i in range(len(steps)):
        f = ROOT / "audio" / f"{key}_{i}.mp3"
        if f.exists():
            audio[key].append("data:audio/mpeg;base64," + base64.b64encode(f.read_bytes()).decode("ascii"))
        else:
            audio[key].append("")
            missing.append(f.name)

caps = {k: [{"cap": s["cap"]} for s in v] for k, v in narr.items()}
data_js = (
    "window.NARR=" + json.dumps(caps, ensure_ascii=False) + ";\n"
    "window.DUR=" + json.dumps(dur) + ";\n"
    "window.AUDIO=" + json.dumps(audio) + ";\n"
)

html = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>光的偵探社 — 光譜分析與應用</title>
<meta name="description" content="高中彈性學習 2 節課：光譜分析與應用。SOIL 三段式互動教材，含 4 段語音動畫、5 個小遊戲與結業測驗。">
<style>
{(src / "style.css").read_text(encoding="utf-8")}
</style>
</head>
<body>
{(src / "body.html").read_text(encoding="utf-8")}
<script>
{data_js}</script>
<script>
{(src / "app.js").read_text(encoding="utf-8")}
</script>
</body>
</html>
"""
out = ROOT / "index.html"
out.write_text(html, encoding="utf-8", newline="\n")
print("built", out.name, round(out.stat().st_size / 1024), "KB; missing audio:", missing or "none")
