const test=require('node:test');
const assert=require('node:assert/strict');
const {parseProcessTable,aggregateProcessTree,createAcceleratedResourceMonitor,
 DEFAULT_RSS_BUDGET_MIB,launchObservedChromium}=require('./accelerated-resource-telemetry.cjs');
test('process-tree RSS aggregates Chromium children without unrelated processes',()=>{
 const rows=parseProcessTable('100 1 102400 12.5\n101 100 204800 50\n102 101 51200 18\n103 1 999999 99\n');
 assert.deepEqual(aggregateProcessTree(rows,100),
  {count:3,rssMiB:350,cpuLifetimePct:80.5});
 assert.equal(DEFAULT_RSS_BUDGET_MIB,4096);
});
test('malformed ps rows cannot spoof counters',()=>{
 const rows=parseProcessTable('bad\n123 1 -10 40\n123 1 2048 5\n456 123 1024 2\n');
 assert.equal(rows.length,2);
 assert.equal(aggregateProcessTree(rows,123).rssMiB,3);
 assert.throws(()=>aggregateProcessTree(rows,999),/unavailable/);
});
test('resource monitoring records peak memory, output bytes, and over-budget state',()=>{
 let time=0,reads=0;
 const rows=['100 1 10240 4\n101 100 2048 7\n',
  '100 1 20480 8\n101 100 4096 9\n'];
 const monitor=createAcceleratedResourceMonitor({
  browserPid:100,intervalMs:999999,clock:()=>time,
  processList:()=>rows[Math.min(reads++,1)],
  maxRssMiB:20,getOutput:()=>({bytes:reads*1024,writes:reads})
 });
 monitor.start();time=1000;
 const report=monitor.stop();
 assert.equal(report.samples.length,2);
 assert.ok(report.peakRssMiB>20);
 assert.equal(report.overBudget,true);
 assert.equal(report.peakOutputBytes,2048);
 assert.deepEqual(report.errors,[]);
 assert.equal(monitor.stop().samples.length,2);
});
test('missing Chromium root fails observability rather than claiming success',()=>{
 const monitor=createAcceleratedResourceMonitor({browserPid:1,
  intervalMs:999999,processList:()=>''});
 monitor.start();
 const report=monitor.stop();
 assert.equal(report.samples.length,0);
 assert.equal(report.errors.length,2);
});

test('observed browser uses BrowserServer PID, closes both handles and never calls browser.process()',async()=>{
 const operations=[];
 const browser={close:async()=>operations.push('browser.close')};
 const server={
  process:()=>({pid:4321}),wsEndpoint:()=> 'ws://127.0.0.1:9876/session',
  close:async()=>operations.push('server.close')
 };
 const playwright={
  launchServer:async opts=>{operations.push('launchServer');assert.equal(opts.headless,true);return server;},
  connect:async (endpoint,opts)=>{
   operations.push('connect');
   assert.equal(endpoint,server.wsEndpoint());
   assert.equal(opts.timeout,30000);
   return browser;
  }
 };
 const observed=await launchObservedChromium(playwright,{headless:true});
 assert.equal(observed.browserPid,4321);
 assert.equal(observed.browser,browser);
 await observed.close();
 assert.deepEqual(operations,['launchServer','connect','browser.close','server.close']);
});
test('monitor browser launcher fails closed and cleans server on connection/PID failure',async()=>{
 for(const {server,expectConnect} of [
  {server:{process:()=>({pid:0}),wsEndpoint:()=> 'ws://localhost',close:async()=>{}},
   expectConnect:false},
  {server:{process:()=>({pid:123}),wsEndpoint:()=> 'ws://localhost',close:async()=>{}},
   expectConnect:true}
 ]) {
  let closed=0,connected=0;
  const original=server.close;
  server.close=async()=>{closed++;await original();};
  const chromium={launchServer:async()=>server,
   connect:async()=>{connected++;throw Error('socket failed');}};
  await assert.rejects(launchObservedChromium(chromium,{headless:true}),
   /PID unavailable|socket failed/);
  assert.equal(connected,expectConnect?1:0);
  assert.equal(closed,1);
 }
});
