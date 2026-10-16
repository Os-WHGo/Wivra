---
name: jake-yt-shorts
description: >-
  Reference aid (third-party, MIT) for Wivra development: heuristics to pick self-contained 20-55 s moments of a long video from its transcript and write the Short's new hook, on-screen text and loop point. Use to design Wivra's own Shorts/Reels suggestions; nothing is published.
---

> **WIVRA RULES FOR THIS THIRD-PARTY SKILL (read first; they win over anything below).**
> - Source: https://github.com/Jakeschincariol/youtube-agent-skill/tree/main/skills/yt-shorts (MIT, © 2026 Jake Schincariol), pinned commit `a2feb21`, selectively vendored. See `UPSTREAM.md` in this folder and `.claude/skills/THIRD_PARTY_NOTICES.md`.
> - This is a **reference/analysis aid for building Wivra's single editor**. It must NOT become a second editor, and must not replace an existing Wivra feature without first checking `docs/` and the code (do not rebuild what exists).
> - Never modify or overwrite the owner's original media (non-destructive). Write outputs only to a scratch/temporary folder or to a draft-PR branch, never to `main`.
> - Do NOT run any install command quoted below (`npx`, `pip`, `npm i`, `brew`, `git clone`, `claude plugin ...`, `ln -s`), do not download models, and do not call paid APIs or send media/text to third-party services. If something needs an install, tell the owner first.
> - Do not write outside the project (e.g. `~/.claude/...`) and do not publish/post anything to any account. Wivra publishes nothing without the owner's approval.
> - Study **observable functionality** of other apps only; never copy their code, assets, copy text, logos or distinctive UI (AGENTS.md rule 3). Slash-commands named below that are not installed here (e.g. `/ig-human`, `/yt-script`, `/replica-architect`) simply do not exist: skip those steps.
> - Wivra content is mostly **POV / outdoor / events (e.g. Ray-Ban), often without a face on camera**: rewrite any rule that assumes a talking head. Silence in a POV, hiking, concert or ambient clip is often intentional: never cut or call it "dead air" without the user's approval of each proposal (reversible suggestions, not automatic cuts).
> - Editorial numbers quoted below (e.g. -14 LUFS, 1.5 s shots, 3 s hooks, safe-zone pixels) are the author's house style, not universal standards: present them as options, not rules.
> - Mark claims as verified (with source) or not verified, and sign with the AI's name (AGENTS.md).
> - Extra: it mentions `../yt-script/hookscore.py` (not installed); use `.claude/skills/jake-ig-reel/hookscore.py` instead (English-only heuristics: Spanish hooks score unfairly low).



# yt-shorts

A Short cut out of a long video is not a clip of the best moment. It is a moment that **survives
without the video around it**, which is a much smaller set.

## Picking

Read the transcript and find spans of 20-55 seconds where all three are true:

1. It opens on a complete thought. If the first sentence needs the previous minute, it is not a Short.
2. There is a turn in it - a claim, then something that complicates or proves it.
3. It ends on a line, not a trail-off.

Rank the candidates and show the user the top five with their timecodes and first line, so they can
reject one without reading the whole transcript.

## Writing each one

- **A NEW first line.** The long video's line assumes context this viewer does not have. Write the
  replacement and run it through `../yt-script/hookscore.py`.
- **On-screen text for the first two seconds**, different words from the spoken line.
- **A loop point**: what the last line sets up so the first line answers it.
- Vertical framing note - what gets cropped out of a 16:9 frame and whether that matters.

## The gate

Nothing here publishes. This skill writes and you publish. Every output ends in a block the user
copies, and the last line of every run is the question: **ship it, or change it?**
