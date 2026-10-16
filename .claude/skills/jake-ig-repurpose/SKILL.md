---
name: jake-ig-repurpose
description: >-
  Reference aid (third-party, MIT) for Wivra development: method to extract standalone claims, numbers, stories and lines from one long asset and plan a week of reels/carousels. Use to design Wivra's repurposing feature; nothing is published.
---

> **WIVRA RULES FOR THIS THIRD-PARTY SKILL (read first; they win over anything below).**
> - Source: https://github.com/Jakeschincariol/instagram-agent-skill/tree/main/skills/ig-repurpose (MIT, © 2026 Jake Schincariol), pinned commit `d03c56b`, selectively vendored. See `UPSTREAM.md` in this folder and `.claude/skills/THIRD_PARTY_NOTICES.md`.
> - This is a **reference/analysis aid for building Wivra's single editor**. It must NOT become a second editor, and must not replace an existing Wivra feature without first checking `docs/` and the code (do not rebuild what exists).
> - Never modify or overwrite the owner's original media (non-destructive). Write outputs only to a scratch/temporary folder or to a draft-PR branch, never to `main`.
> - Do NOT run any install command quoted below (`npx`, `pip`, `npm i`, `brew`, `git clone`, `claude plugin ...`, `ln -s`), do not download models, and do not call paid APIs or send media/text to third-party services. If something needs an install, tell the owner first.
> - Do not write outside the project (e.g. `~/.claude/...`) and do not publish/post anything to any account. Wivra publishes nothing without the owner's approval.
> - Study **observable functionality** of other apps only; never copy their code, assets, copy text, logos or distinctive UI (AGENTS.md rule 3). Slash-commands named below that are not installed here (e.g. `/ig-human`, `/yt-script`, `/replica-architect`) simply do not exist: skip those steps.
> - Mark claims as verified (with source) or not verified, and sign with the AI's name (AGENTS.md).
> - Extra: it refers to `ig-reel/hooks.json`; the installed copy is `.claude/skills/jake-ig-reel/hooks.json`.



# ig-repurpose

One good long asset contains four to six posts. Most people extract one and
throw the rest away.

## Input

A transcript, an article, a newsletter, a script, a call summary, a livestream.
If the user gives a URL and this session has a transcript tool, use it;
otherwise ask them to paste. Read the whole thing before extracting anything.

If the source is a video the user owns, ask for the file too. A Reel built on
their own footage beats one built on their own words read again.

## Extract, do not summarise

A summary of a video is not a Reel. Nobody wants the summary. Go through the
asset and pull out the things that stand alone:

| pull | what it is |
| --- | --- |
| **Claims** | every sentence that would start an argument |
| **Numbers** | every figure, cost, duration, percentage |
| **Stories** | every moment with a person, a scene and a cost |
| **Mechanisms** | every "the way this actually works is..." |
| **Mistakes** | every admission of something that went wrong |
| **Lines** | every sentence already quotable as-is |

List what you found, with counts, before writing anything. If the asset yields
fewer than four items, it is thin, and four posts squeezed out of it will be
thin too. Say that.

## Then pick the format per extract

Not everything is a Reel.

- **Claim, mistake, story** to a Reel. They need a voice and a face.
- **Mechanism, numbered list** to a carousel. They need to be re-read.
- **A quotable line** to a story frame, not a post.

## Then build the week

Each extract becomes one post and each post stands completely on its own. The
viewer has not seen the source and never will. Never write "as I said in my
latest video". The post is the thing.

Assign a hook formula from `ig-reel/hooks.json` to each and vary them. Five
posts from one source with the same hook shape reads as a content mill, because
it is one.

If the source is the user's own video, **use the actual footage**. The clip
where they said the thing, with the real reaction in it, beats a re-record
every time. Cut on the sentence, not on the breath.

Order across the week so the strongest claim goes first, the story lands
midweek, and the mechanism goes last, when the people who liked the earlier
ones are watching for it.

## Output

```
SOURCE: "Why we killed discovery calls" (42 min podcast, 8,900 words)

FOUND  5 claims, 9 numbers, 3 stories, 4 mechanisms, 2 mistakes, 7 quotable lines

WEEK
TUE  REEL      #2  Negative Command  Stop running discovery calls
                                     use the 14:20 clip, he laughs at the end
WED  CAROUSEL  Job B caption         The 4-question form that replaced the call
FRI  REEL      #21 Mid-Sentence      "...and he asked for a refund nine days later"
SUN  REEL      #5  Time Collapse     Six hours a week back, one deleted link

Say "write Tuesday" and I will draft it.
```

Then draft on request, one at a time, each through `/ig-reel` and `/ig-human`.
Do not dump four finished scripts at once. They will all sound the same and the
user will shoot none of them.
