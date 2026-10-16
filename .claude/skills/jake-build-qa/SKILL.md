---
name: jake-build-qa
description: >-
  Accessibility and HTML basics checks for Wivra's single-file editor (app/dist/agentcut.html) using two offline Python tools from Jake Schincariol's master-skills (MIT): sitecheck.py (labels, button names, duplicate ids, viewport, alt) and contrast.py (WCAG contrast). Use to audit accessibility or responsive basics; not a site builder and never deploys anything.
---

# jake-build-qa (Wivra-authored wrapper; tools are third-party MIT)

Only `tools/contrast.py`, `tools/sitecheck.py`, `tools/serve.py` (needed by sitecheck's folder mode; never use its `--lan` or `--open`) and `checklists/qa.md` were copied (byte-identical) from
https://github.com/Jakeschincariol/master-skills (`skills/build`, pinned commit `b5b43e4`). The upstream `build` workflow
(from-scratch website builder with deploy to Netlify/Vercel/Cloudflare) is **not installed**: Wivra is an existing app with an agreed design.
See `UPSTREAM.md` and `.claude/skills/THIRD_PARTY_NOTICES.md`.

## Rules
- Run on a **copy** in a scratch folder, in **folder mode** only: `python3 tools/sitecheck.py site/ --depth 1` (it serves the folder on 127.0.0.1 itself). Never pass `--external`, never point it at third-party sites, never deploy or publish.
- `sitecheck.py` reads static HTML only (it does not run JavaScript), so controls created by the app's scripts are not covered: complete with a real-browser check (Playwright is already in the workspace; do not install anything).
- This does not replace testing on a real iPhone/Android. Real-phone tests are done by the owner (AGENTS.md).
- Findings are suggestions: do not change the editor from this skill; open a draft PR or leave a note in issue #49 first (Claude owns the editor).
- Colour contrast: `python3 tools/contrast.py "#ffffff" "#777777"` or `--pair fg:bg --css file`.

Last verified use (2026-10-16, static markup of the editor): 12 errors (6 unlabeled fields, 6 unnamed colour swatch buttons) and 4 warnings. See `docs/SKILLS_INTEGRATION_2026-10-16.md`.
