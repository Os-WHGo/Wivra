---
name: jake-replica-test
description: >-
  Reference aid (third-party, MIT) for Wivra development: build a numbered test plan (happy path, edge cases, negative cases) and bug-report format for Wivra's own flows, with Playwright end-to-end tests where possible. Test Wivra only, never a third-party app's servers.
---

> **WIVRA RULES FOR THIS THIRD-PARTY SKILL (read first; they win over anything below).**
> - Source: https://github.com/Jakeschincariol/replica-skill/tree/main/replica-test (MIT, © 2026 Jake Schincariol), pinned commit `77c9436`, selectively vendored. See `UPSTREAM.md` in this folder and `.claude/skills/THIRD_PARTY_NOTICES.md`.
> - This is a **reference/analysis aid for building Wivra's single editor**. It must NOT become a second editor, and must not replace an existing Wivra feature without first checking `docs/` and the code (do not rebuild what exists).
> - Never modify or overwrite the owner's original media (non-destructive). Write outputs only to a scratch/temporary folder or to a draft-PR branch, never to `main`.
> - Do NOT run any install command quoted below (`npx`, `pip`, `npm i`, `brew`, `git clone`, `claude plugin ...`, `ln -s`), do not download models, and do not call paid APIs or send media/text to third-party services. If something needs an install, tell the owner first.
> - Do not write outside the project (e.g. `~/.claude/...`) and do not publish/post anything to any account. Wivra publishes nothing without the owner's approval.
> - Study **observable functionality** of other apps only; never copy their code, assets, copy text, logos or distinctive UI (AGENTS.md rule 3). Slash-commands named below that are not installed here (e.g. `/ig-human`, `/yt-script`, `/replica-architect`) simply do not exist: skip those steps.
> - Wivra content is mostly **POV / outdoor / events (e.g. Ray-Ban), often without a face on camera**: rewrite any rule that assumes a talking head. Silence in a POV, hiking, concert or ambient clip is often intentional: never cut or call it "dead air" without the user's approval of each proposal (reversible suggestions, not automatic cuts).
> - Editorial numbers quoted below (e.g. -14 LUFS, 1.5 s shots, 3 s hooks, safe-zone pixels) are the author's house style, not universal standards: present them as options, not rules.
> - Mark claims as verified (with source) or not verified, and sign with the AI's name (AGENTS.md).
> - Extra: Playwright and Chromium are already available in the cloud workspace; do not run `npm i`/`playwright install`. Real-phone tests are done by the owner (AGENTS.md). Existing Wivra checks first: `app/tests`, `core/tests`, `.claude/skills/wivra-mobile-qa`.



# replica-test

Reads the flows in `replica/recon.md`. Writes `replica/test-plan.md`,
`replica/bugs.md`, and end-to-end tests in the project (`e2e/`). Templates in
this folder: `test-plan.md`, `bug-report.md`, `e2e.example.spec.ts`.

## The rule

**Test your clone, not the original.** Never load test, fuzz, script or
hammer the original app's servers. Using the original by hand, as a normal
user, to see how it behaves is fine.

## Step 1: the plan

For every flow F01, F02... in the recon map, write:

- **Happy path**: the steps, and what the user should see at the end.
- **Edge cases** that apply. Go down this list for every flow:
  empty input, very long input, emoji and accents, two tabs at once,
  double click on submit, back button mid-flow, refresh mid-flow, slow
  network, offline, expired session, second user's data (must be invisible),
  time zones and daylight saving, mobile width, keyboard only, screen reader
  labels.
- **Negative cases**: wrong password, card declined (Stripe test card
  `4000 0000 0000 0002`), permission denied, deleted record.

Number every case: F01-H1, F01-E3, F01-N2.

## Step 2: automate what you can

Playwright, one spec per flow, against the local dev server with seed data.
Use roles and labels for selectors (`getByRole('button', { name: 'Book' })`),
never CSS classes. See `e2e.example.spec.ts`.

```bash
npm i -D @playwright/test && npx playwright install chromium
npx playwright test
```

Add to every spec: fail on console errors, fail on any 5xx response, and an
axe accessibility scan (`@axe-core/playwright`) on each screen.

## Step 3: click through the rest

What cannot be automated (emails arriving, OAuth with real providers,
payments end to end, visual glitches) gets a manual pass. If a browser tool is
available, drive the local clone with it and screenshot each step. Otherwise
give the user the checklist and wait for answers.

## Step 4: report bugs

Every bug goes in `replica/bugs.md` in the `bug-report.md` format: an ID, a
severity, exact steps, expected, actual, evidence. Severity:

| | means |
| --- | --- |
| S1 | data loss, security hole, payments wrong, core flow blocked |
| S2 | a feature broken, no workaround |
| S3 | broken with a workaround, or visibly wrong |
| S4 | cosmetic |

Only report what you reproduced. "Might be an issue" goes in a separate
"to check" list.

## Step 5: fix loop

Fix S1 and S2 first. For every fix: write the failing test first, fix, watch
it pass, keep the test. Re-run the whole suite after each batch. Update
`bugs.md` with the commit that fixed each one.

## Output

`test-plan.md`, the specs, `bugs.md`, and a summary: cases run, passed,
failed, bugs by severity, fixed so far. Ship nothing with an open S1. Next:
`/replica-diff`.
