// Wivra P0-W26: only for Linux/Chromium QA, NOT shipped with mobile editor.
'use strict';
const {execFileSync}=require('node:child_process');
const DEFAULT_RSS_BUDGET_MIB=4096;
function parseProcessTable(text){
 if(typeof text!=='string')throw Error('ps table unavailable');
 return text.trim().split(/\r?\n/).map(line=>{
  const [pid,ppid,rssKB,cpuPct]=line.trim().split(/\s+/).map(Number);
  return Number.isSafeInteger(pid)&&pid>0&&Number.isSafeInteger(ppid)&&
    ppid>=0&&Number.isFinite(rssKB)&&rssKB>=0&&
    Number.isFinite(cpuPct)&&cpuPct>=0?{pid,ppid,rssKB,cpuPct}:null;
 }).filter(Boolean);
}
function aggregateProcessTree(rows,rootPid){
 if(!Number.isSafeInteger(rootPid)||rootPid<=0)throw Error('Chromium PID invalid');
 if(!rows.some(row=>row.pid===rootPid))
  throw Error('Chromium process unavailable');
 const ids=new Set([rootPid]);
 let growing=true;
 while(growing){
  growing=false;
  for(const row of rows)
   if(ids.has(row.ppid)&&!ids.has(row.pid)){ids.add(row.pid);growing=true;}
 }
 const family=rows.filter(row=>ids.has(row.pid));
 return {count:family.length,
  rssMiB:Number((family.reduce((n,row)=>n+row.rssKB,0)/1024).toFixed(2)),
  cpuLifetimePct:Number(family.reduce((n,row)=>n+row.cpuPct,0).toFixed(2))};
}
function createAcceleratedResourceMonitor({
 browserPid,intervalMs=5000,maxRssMiB=DEFAULT_RSS_BUDGET_MIB,
 clock=()=>Date.now(),processList=()=>execFileSync('ps',
  ['-eo','pid=,ppid=,rss=,%cpu='],{encoding:'utf8',timeout:3000}),
 getOutput=()=>({bytes:0,writes:0})
}={}){
 if(!Number.isSafeInteger(browserPid)||browserPid<=0||
   !Number.isSafeInteger(intervalMs)||intervalMs<1000||
   !Number.isFinite(maxRssMiB)||maxRssMiB<=0)
  throw Error('Invalid long-form resource monitor');
 const start=clock(),samples=[],errors=[];
 let timer=null,ended=false,overBudget=false;
 function sample(){
  if(ended)return;
  try{
   const family=aggregateProcessTree(parseProcessTable(processList()),browserPid);
   const out=getOutput();
   if(!Number.isSafeInteger(out.bytes)||out.bytes<0||
      !Number.isSafeInteger(out.writes)||out.writes<0)
    throw Error('Invalid output counters');
   if(family.rssMiB>maxRssMiB)overBudget=true;
   samples.push({elapsedSeconds:Number(((clock()-start)/1000).toFixed(1)),
    rssMiB:family.rssMiB,cpuLifetimePct:family.cpuLifetimePct,
    processes:family.count,outputBytes:out.bytes,writes:out.writes});
   if(samples.length>1000)samples.shift();
  }catch(error){errors.push(String(error?.message||error));}
 }
 return {
  start(){if(timer||ended)throw Error('Resource monitor already started');
   sample();timer=setInterval(sample,intervalMs);return this;},
  stop(){if(!ended){if(timer)clearInterval(timer);timer=null;sample();ended=true;}
   return {samples,errors,overBudget,rssBudgetMiB:maxRssMiB,
    peakRssMiB:Math.max(0,...samples.map(x=>x.rssMiB)),
    peakCpuLifetimePct:Math.max(0,...samples.map(x=>x.cpuLifetimePct)),
    peakOutputBytes:Math.max(0,...samples.map(x=>x.outputBytes)),
    semantics:'ps: aggregate Chromium process-tree RSS (shared pages may double-count); lifetime CPU%; Linux QA only'};
  }
 };
}
module.exports={DEFAULT_RSS_BUDGET_MIB,parseProcessTable,
 aggregateProcessTree,createAcceleratedResourceMonitor};
