#!/usr/bin/env node
// W86 (Claude): input.json for the in-page driver on the Android emulator / iOS simulator.
// Usage: node make-e2e-input.cjs <video> <video/type> <tiny|base> <lang> <word,word> > input.json
'use strict';
const fs = require('node:fs');
const [, , video, type, model, lang, words = ''] = process.argv;
process.stdout.write(JSON.stringify({ phase: 'full', cancel: true, videoB64: fs.readFileSync(video).toString('base64'), videoName: 'Wivra_E2E.mov', videoType: type, model, lang, words: words.split(',').filter(Boolean) }));
