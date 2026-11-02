# Wivra Skill Pack · mobile first

**Added by ChatGPT for owner review · 2026-10-16.**

A small project-local collection for Wivra's existing app, not a new application, new editor or permission to replace working code. **Priority: iOS/Android capture, networking, audio and source QA**, with Claude's single editor preserved.

## What's ready

| Skill | File | Executable helper | Reality |
|---|---|---|---|
| Wivra Media Inspect | `.claude/skills/wivra-media-inspect/SKILL.md` | `tools/media_inspect.py` | Read-only metadata from **local files**; requires external `ffprobe` for real inspection |
| Wivra Mobile QA | `.claude/skills/wivra-mobile-qa/SKILL.md` | `tools/mobile_qa.py` | Read-only source marker checklist with **physical tests explicitly unrun** |

```bash
python3 wivra-skill-pack/tools/media_inspect.py --doctor
python3 wivra-skill-pack/tools/media_inspect.py /local/path/capture.mov --json
python3 wivra-skill-pack/tools/mobile_qa.py --repo . --json
python3 -m unittest discover -s wivra-skill-pack/tests -v
```

The scripts use Python 3.9+ standard library only, run **no installer**, make **no network requests**, use **no API keys**, and **do not modify media**. Media inspection delegates read-only metadata probing to optional FFprobe via `subprocess.run` without a shell. No FFmpeg executable is needed for static source QA. All paths given to the media tool must be local.

## How Claude and ChatGPT share it

- **Claude Code**: project-local `.claude/skills/` is the discovery location when this working tree is used. Skills may show as `/wivra-media-inspect` and `/wivra-mobile-qa` depending on the Claude Code version/configuration. **We cannot verify discovery in the user's personal Claude account from GitHub CI**.
- **Claude web chat without repository skill loading**: send Claude the direct GitHub links to SKILL.md. Do not claim native skill installation.
- **ChatGPT**: read the files through the connected Wivra GitHub repository and use the same documented workflow with available code/runtime tools. These files are **not permanently installed** into ChatGPT's built-in skill registry by a GitHub PR.
- No changes to `main` or the editor. Installation in the user's local Claude Code environment is contingent on checking out the draft PR branch and reviewing it, not automatic from opening the issue.

## Source/provenance and legal scope

Designs were inspired by open-source materials from Jake Schincariol:
- [master-skills/edit](https://github.com/Jakeschincariol/master-skills/tree/main/skills/edit) and its media probing practice (MIT, 2026 Jake Schincariol).
- [replica-skill/replica-test](https://github.com/Jakeschincariol/replica-skill/tree/main/replica-test) and severity/repro steps (MIT, 2026 Jake Schincariol).

The Wivra scripts and skill instructions are **new and independently written**; no substantial source code was copied from either repository. The third-party repositories and their MIT license notices remain their own; if we later vendor their scripts verbatim or in substantial portions, include the full relevant MIT copyright/license notice and pin the source commit before merging.

## Explicitly excluded for now

No `arena`, mass subagents, replica/cloning of third-party apps, private API probing, unverified content upload, global skill installation, FFmpeg download, video transcoding, photo/audio effects, editor/Claude ownership changes, automatic mobile data usage, desktop runtime, or claims of real camera test success.

## QA expectations

The source checklist checks only existence of relevant code and translations; CI verifies its behavior with **synthetic fixtures**. A positive source result does not prove features work. iOS and Android native builds run under separate existing workflows; physical validation remains necessary.

Further editor intelligence (e.g. `yt-edit` EDL, `yt-shorts` selection and captions) stays with Claude in a separate review and must not duplicate the current editor.
