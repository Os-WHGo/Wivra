---
name: wivra-media-inspect
description: Inspect local video/audio files for Wivra capture QA, codec/rotation/FPS/audio stream metadata without modifying media or uploading it. Use for MOV/MP4/CAF diagnostics, long recording checks and source compatibility.
---

# Wivra Media Inspect (Claude Code / shared Wivra)

This is a **project-scoped skill**. ChatGPT can follow the same steps by reading this file through Wivra's GitHub repo; it is **not** a globally installed ChatGPT skill.

## Rules
- Camera/video input and LIVE, Ray-Ban Meta, HFP/USB audio and recording remain ChatGPT's responsibility. Do not modify capture implementation while inspecting media; coordinate in issue #49.
- Use files the owner supplied or local synthetic fixtures only, with permission. Never copy, upload, transcribe, delete, replace, trim or rename originals.
- Run a **read-only** ffprobe-based diagnostic from a local checkout. No cloud AI call or network access is needed.
- `ffprobe` must be on PATH for real files. If missing, report that fact; do not install it without approval.
- Inspect local manifest v2 separately, if available. A stream list is **not** a manifest or proof of frame-level sync.
- If a file contains no audio, distinguish intentional silent video from separate CAF audio. Do not infer an audio recording was lost.
- If inputs are personally identifiable, never paste absolute file paths or raw frames into issues. This tool displays only the filename, metadata and summary.

## Workflow

```bash
python3 wivra-skill-pack/tools/media_inspect.py --doctor
python3 wivra-skill-pack/tools/media_inspect.py /path/to/owner-approved.mov --json
```

Interpret outputs for the requested goal: HEVC/AVC compatibility, audio channels/sample rate, rotation, container duration and possible average/nominal FPS differences. A warning about differing frame rates is **not** proof of VFR: frame timestamps would require separate analysis.

Report: file basename, streams, warnings, missing evidence, suggested next physical test. If ffprobe exits nonzero, don't claim success. No postprocessing unless the owner separately requests it.

Provenance: independently authored Wivra adaptation informed by Jake Schincariol's MIT-licensed [master-skills/edit](https://github.com/Jakeschincariol/master-skills/tree/main/skills/edit). No upstream scripts copied.
