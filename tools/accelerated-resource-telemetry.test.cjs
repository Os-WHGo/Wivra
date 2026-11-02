const test=require('node:test');
const assert=require('node:assert/strict');
const {parseProcessTable,aggregateProcessTree,createAcceleratedResourceMonitor,
 DEFAULT_RSS_BUDGET_MIB}=require('./accelerated-resource-telemetry.cjs');
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
