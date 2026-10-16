# Third-party notices · skills vendored under `.claude/skills/jake-*`

Selectively copied (not whole collections) from four MIT-licensed repositories by Jake Schincariol.
Each skill folder has an `UPSTREAM.md` with source path, pinned commit and the exact Wivra modifications
(only the `SKILL.md` front matter plus a "WIVRA RULES" block). Scripts and data files are byte-identical to upstream.

| Wivra folder | Upstream | Pinned commit |
|---|---|---|
| `jake-edit` | https://github.com/Jakeschincariol/master-skills (`skills/edit`) | `b5b43e4` |
| `jake-yt-edit`, `jake-yt-shorts`, `jake-yt-retention` | https://github.com/Jakeschincariol/youtube-agent-skill | `a2feb21` |
| `jake-ig-reel`, `jake-ig-repurpose` | https://github.com/Jakeschincariol/instagram-agent-skill | `d03c56b` |
| `jake-replica-recon`, `jake-replica-test`, `jake-replica-diff` | https://github.com/Jakeschincariol/replica-skill | `77c9436` |

Not installed on purpose: `build` and `replica-build` (conflict with the "single Wivra editor" rule), `arena-skill`, and every other skill of those repositories.

The license text below is identical in all four upstream repositories (checked).

```
MIT License

Copyright (c) 2026 Jake Schincariol

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The two Wivra-authored skills (`wivra-media-inspect`, `wivra-mobile-qa`) are independent work by ChatGPT (PR #113) and are not covered by this notice.
