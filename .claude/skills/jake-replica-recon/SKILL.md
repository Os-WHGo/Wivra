---
name: jake-replica-recon
description: >-
  Reference aid (third-party, MIT) for Wivra development: clean-room feature study of another app from PUBLIC sources (help center, changelog, store listing) into a screen inventory, flows and feature matrix (features.csv). Use to compare observable functions with Wivra and plan original implementations; never to clone an app.
---

> **WIVRA RULES FOR THIS THIRD-PARTY SKILL (read first; they win over anything below).**
> - Source: https://github.com/Jakeschincariol/replica-skill/tree/main/replica-recon (MIT, © 2026 Jake Schincariol), pinned commit `77c9436`, selectively vendored. See `UPSTREAM.md` in this folder and `.claude/skills/THIRD_PARTY_NOTICES.md`.
> - This is a **reference/analysis aid for building Wivra's single editor**. It must NOT become a second editor, and must not replace an existing Wivra feature without first checking `docs/` and the code (do not rebuild what exists).
> - Never modify or overwrite the owner's original media (non-destructive). Write outputs only to a scratch/temporary folder or to a draft-PR branch, never to `main`.
> - Do NOT run any install command quoted below (`npx`, `pip`, `npm i`, `brew`, `git clone`, `claude plugin ...`, `ln -s`), do not download models, and do not call paid APIs or send media/text to third-party services. If something needs an install, tell the owner first.
> - Do not write outside the project (e.g. `~/.claude/...`) and do not publish/post anything to any account. Wivra publishes nothing without the owner's approval.
> - Study **observable functionality** of other apps only; never copy their code, assets, copy text, logos or distinctive UI (AGENTS.md rule 3). Slash-commands named below that are not installed here (e.g. `/ig-human`, `/yt-script`, `/replica-architect`) simply do not exist: skip those steps.
> - Mark claims as verified (with source) or not verified, and sign with the AI's name (AGENTS.md).
> - Extra: ONLY clean-room study of observable features of other apps from public sources, to inform original Wivra work. `replica-build` and all cloning steps are intentionally NOT installed. Put outputs in a scratch folder (not a `replica/` folder in the repo) unless the owner approves a draft PR with a feature-study doc. No third-party screenshots in the repo.



# replica-recon

Everything else in the pack builds from what this skill writes. A bad recon
map means a bad clone, so take the time here.

Output goes in the user's project:

```
replica/recon.md        the recon map (template: recon-map.md in this folder)
replica/features.csv    the feature matrix (template: features.csv in this folder)
replica/screens/        reference screenshots of the original. Never shipped.
```

## The rules, before anything else

This skill rebuilds **functionality and UX patterns**, clean-room style. It
studies what the app does and how a user moves through it. It does not take
anything the app owns.

- **Public sources and the user's own account only.** Never log into an
  account that is not the user's, never ask for a password, never get past a
  paywall or a login by any trick.
- **Reading, not scraping.** No crawlers, no bulk downloads, no loops. If a
  browser tool is connected to the user's own browser, read pages at human
  speed with the user present.
- **No source code, no private APIs.** Do not read or save the app's
  JavaScript bundles, decompile its binary, or log its network calls to copy
  endpoints. Public API docs are fine to read.
- **Check the terms.** Some products' terms forbid using an account to build a
  competing product. If the user's account is under terms like that, say so
  and work from public sources only.
- **Screenshots are reference.** They live in `replica/screens/`, are used to
  compare layouts, and never go into the clone.

## Step 1: scope

Ask three things, or propose answers and get a yes:

1. **Which app, which platform.** Web, iOS, Android, desktop.
2. **Which slice.** "All of Notion" is not a project. "Notion's pages, blocks
   and sharing" is. Default to the core loop: the one flow users pay for.
3. **Who it is for.** The user's own business, a niche, a product to sell.

## Step 2: list the sources

Build a sources table first, with a URL on every row. In order of value:

| source | what it gives you |
| --- | --- |
| help center / docs | the most complete feature list there is, and the settings |
| pricing page | which features matter (they gate them) |
| changelog | what was added recently, what the team thinks is important |
| app store listing | screenshots of every key screen, the pitch, ratings |
| public walkthrough videos | real flows, click by click |
| marketing site | positioning, the core loop in their words |
| the user's own account | the real thing, every state, driven by the user |
| public API docs | the data model, almost for free |

## Step 3: screen inventory

One row per screen. IDs are stable: S01, S02... Every other file refers to them.

`ID | screen | route or how you get there | purpose | key components | states seen`

States matter: empty, loading, filled, error, permission denied, mobile. An
empty state you did not record is an empty state you will not build.

## Step 4: user flows

F01, F02... Each one is a goal and the screens it passes through:

```
F01 Guest books a meeting
    S07 booking page -> S08 pick a time -> S09 details form -> S10 confirmed
    edge: no slots this week, time zone differs, slot taken while filling the form
```

Count the clicks on the happy path. It becomes the number to beat.

## Step 5: components

Every repeated UI part: buttons, inputs, date pickers, modals, tables, toasts,
nav. Name, variants, states, which screens use it. This becomes
replica-design's component list.

## Step 6: inferred data model

Entities, fields and relationships, each with its evidence and a confidence:

```
Booking  id, event_type_id, start_at, end_at, guest_name, guest_email,
         status (confirmed | cancelled | rescheduled), answers (json)
         evidence: S09 form fields, S10 confirmation, help article "Cancel a booking"
         confidence: high
```

Mark guesses as guesses. replica-architect turns this into a real schema.

## Step 7: feature matrix

Write `replica/features.csv` (columns: feature, area, priority, original,
clone, notes). Priority is must / should / could. `clone` starts at `no` for
every row and gets filled in during the build. replica-diff scores it.

## Step 8: what cannot be cloned

List it honestly, as `skip` rows with a reason: licensed content (a music
catalogue, a stock library), the network and its users, data the app owns,
partner deals, hardware, regulated licences (banking, health). "Clone any
app" means the features and the flow, not what the app owns.

## Step 9: size it

Screens, flows, entities, and the hard parts (realtime, sync, payments,
calendar or email integrations, offline). Give a size: S (a weekend), M (a
few weeks), L (a quarter), XL (rescope it). No promises of a perfect clone.

## Output

`replica/recon.md` and `replica/features.csv`, then a five-line summary: the
core loop, screen and flow counts, the three hardest parts, what is out of
scope, and the next step: `/replica-architect`.
