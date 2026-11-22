'use strict';
// Root of the isolated browser/media test lab (Playwright + pinned Mediabunny).
// CI installs it at /tmp/wivra-media-lab (default, unchanged). Local sessions
// can point WIVRA_MEDIA_LAB at any directory holding node_modules/playwright
// and node_modules/mediabunny (1.61.6, SRI-verified tarball). — Claude
const path=require('node:path');
const LAB=path.resolve(process.env.WIVRA_MEDIA_LAB||'/tmp/wivra-media-lab');
module.exports={LAB};
