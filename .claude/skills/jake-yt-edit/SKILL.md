---
name: jake-yt-edit
description: >-
  Reference aid (third-party, MIT) for Wivra development: turn a timestamped transcript (SRT/VTT/Whisper JSON) into a dead-air/filler/retake edit decision list with deadair.py. Prints cuts only; touches no media. Use for designing or testing Wivra's own silence/filler tools.
---

> **WIVRA RULES FOR THIS THIRD-PARTY SKILL (read first; they win over anything below).**
> - Source: https://github.com/Jakeschincariol/youtube-agent-skill/tree/main/skills/yt-edit (MIT, © 2026 Jake Schincariol), pinned commit `a2feb21`, selectively vendored. See `UPSTREAM.md` in this folder and `.claude/skills/THIRD_PARTY_NOTICES.md`.
> - This is a **reference/analysis aid for building Wivra's single editor**. It must NOT become a second editor, and must not replace an existing Wivra feature without first checking `docs/` and the code (do not rebuild what exists).
> - Never modify or overwrite the owner's original media (non-destructive). Write outputs only to a scratch/temporary folder or to a draft-PR branch, never to `main`.
> - Do NOT run any install command quoted below (`npx`, `pip`, `npm i`, `brew`, `git clone`, `claude plugin ...`, `ln -s`), do not download models, and do not call paid APIs or send media/text to third-party services. If something needs an install, tell the owner first.
> - Do not write outside the project (e.g. `~/.claude/...`) and do not publish/post anything to any account. Wivra publishes nothing without the owner's approval.
> - Study **observable functionality** of other apps only; never copy their code, assets, copy text, logos or distinctive UI (AGENTS.md rule 3). Slash-commands named below that are not installed here (e.g. `/ig-human`, `/yt-script`, `/replica-architect`) simply do not exist: skip those steps.
> - Wivra content is mostly **POV / outdoor / events (e.g. Ray-Ban), often without a face on camera**: rewrite any rule that assumes a talking head. Silence in a POV, hiking, concert or ambient clip is often intentional: never cut or call it "dead air" without the user's approval of each proposal (reversible suggestions, not automatic cuts).
> - Editorial numbers quoted below (e.g. -14 LUFS, 1.5 s shots, 3 s hooks, safe-zone pixels) are the author's house style, not universal standards: present them as options, not rules.
> - Mark claims as verified (with source) or not verified, and sign with the AI's name (AGENTS.md).



# yt-edit

An edit decision list from a timestamped transcript. It prints the cuts. You apply them.

```bash
python3 deadair.py transcript.srt              # srt, vtt or whisper json
python3 deadair.py transcript.srt --floor 0.35 --json
```

No transcript yet? Ask for one, or produce one first - `whisper`, `faster-whisper`, or the caption
track YouTube generates on an unlisted upload all work. Do not guess at timings.

## What it finds

- **DEAD** - gaps longer than the floor, trimmed from the MIDDLE so both sides keep a breath.
  Cutting flush against speech is what makes a tightened take sound gasping.
- **FILLER** - cues that are nothing but "um", "so yeah", "basically".
- **REPEAT** - a sentence restarted. Compared against the last cue that was actually speech, not
  the literal previous cue, because most retakes have an "um" between the two attempts.

## What it will not do

It does not touch media. It has no opinion about your B-roll. A 40% cut on the report is a 40% cut
of SPEECH, and if the video has a long silent demo in it that number is wrong - check the report
against the footage before you trust the runtime at the bottom.

## The gate

Nothing here publishes. This skill writes and you publish. Every output ends in a block the user
copies, and the last line of every run is the question: **ship it, or change it?**
