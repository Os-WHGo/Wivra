#!/usr/bin/env node
// Local RTMP server for the emulator's LIVE reconnection test (Claude). Only on the CI machine, never on
// the internet: ffmpeg listens on rtmp://0.0.0.0:1935/live/wivra and copies what arrives to out-N.flv.
// GET http://0.0.0.0:8099/cut kills it abruptly (a network cut, not a clean close) and opens a new listener
// 6 s later, so the app has to reconnect. GET /status lists the received segments.
// Usage: node tools/rtmp-cut-server.cjs <folder>
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const dir = process.argv[2] || 'rtmp-out';
fs.mkdirSync(dir, { recursive: true });
let n = 0, current = null, cuts = 0;
const log = (m) => console.log(new Date().toISOString() + ' ' + m);

function listen() {
  n += 1;
  const id = n, file = path.join(dir, `out-${id}.flv`);
  const p = spawn('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-analyzeduration', '1000000', '-probesize', '200000', '-listen', '1', '-i', 'rtmp://0.0.0.0:1935/live/wivra',
    '-c', 'copy', '-f', 'flv', '-y', file], { stdio: ['ignore', 'inherit', 'inherit'] });
  current = p;
  log(`listening, segment ${id}`);
  p.on('exit', (code, signal) => {
    log(`segment ${id} ended (${signal || code})`);
    if (current === p) { current = null; setTimeout(listen, 500); }   // the publisher left normally: listen again
  });
}

http.createServer((req, res) => {
  if (req.url === '/cut') {
    cuts += 1;
    const p = current; current = null;
    if (p) p.kill('SIGKILL');
    log('cut');
    setTimeout(listen, 6000);
    res.end('cut');
  } else if (req.url === '/status') {
    const segments = fs.readdirSync(dir).filter((f) => f.endsWith('.flv')).map((f) => ({ file: f, bytes: fs.statSync(path.join(dir, f)).size }));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ cuts, segments }));
  } else { res.statusCode = 404; res.end(); }
}).listen(8099, '0.0.0.0', () => { log('control on :8099'); listen(); });
