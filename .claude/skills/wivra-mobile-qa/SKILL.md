---
name: wivra-mobile-qa
description: Run Wivra's read-only iPhone/Android source QA and prepare honest hardware acceptance checks for Ray-Ban, network routes, HEVC/CAF recovery, permissions and LIVE.
---

# Wivra Mobile QA (Claude Code / shared Wivra)

This is a **project-scoped skill**, not a mobile emulator, not an installed phone app, and not globally installed in ChatGPT. It is usable by other agents from the Wivra repository.

## Operating contract
- Read `AGENTS.md`, current issue/PR heads and the October 15, 2026 rewritten-history safety rule. Avoid stale clones. Never force-push or merge to `main`.
- Mobile iPhone/Android come first. ChatGPT owns native Ray-Ban camera, audio and LIVE; Claude owns the one editor. Coordinate in [Wivra #49](https://github.com/Os-WHGo/Wivra/issues/49).
- Use the local source-only checklist; **never equate marker presence to functional code**, and never claim physical camera tests without hardware observations.
- Do not connect real glasses, activate microphones, upload media, spend cellular data or change privacy/system settings automatically.
- Preserve pending media, manifests, original audio sidecars and undo history.

## Run

```bash
python3 wivra-skill-pack/tools/mobile_qa.py --repo . --json
python3 -m unittest discover -s wivra-skill-pack/tests -v
```

A green status means basic **source markers exist**, not that Meta DAT works. Real QA needs separately recorded owner-side results: actual frames received, video/audio lengths, network status on Wi-Fi vs cellular, storage recoverability after interruption, and Save/Later/Delete confirmations.

When assessing a bug:
1. Reproduce on synthetic fixtures or authorized device; identify OS, build/PR and steps.
2. Label `S1` data loss/privacy breach, `S2` core flow broken, `S3` workaround possible, `S4` cosmetic.
3. Save only minimal non-sensitive evidence and note whether issue is simulated, compiled or physically verified.
4. Write a failing regression test before proposing the fix.
5. Stay within assigned component ownership and open a **draft** PR. Never modify the live editor while changing camera code.

Provenance: independent Wivra QA methodology informed by Jake Schincariol's MIT-licensed [replica-test](https://github.com/Jakeschincariol/replica-skill/tree/main/replica-test). This tool does not copy, reverse-engineer or test third-party apps.
