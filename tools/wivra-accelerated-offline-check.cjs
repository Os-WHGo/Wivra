#!/usr/bin/env node
'use strict';

// Run only local Node tests, optionally rebuild the offline editor HTML.
// Never dispatch Actions, install packages, publish media or produce APK/IPA.
const {spawnSync}=require('node:child_process');
const {existsSync,readdirSync}=require('node:fs');
const {resolve,join}=require('node:path');
const root=resolve(__dirname,'..');
const suiteDir=join(root,'app','tests');
const basics=[
 'accelerated-native-multitrack-export.test.mjs',
 'accelerated-native-cut-export.test.mjs',
 'accelerated-cut-renderer.test.mjs',
 'accelerated-audio-mixer.test.mjs',
 'accelerated-native-sink.test.mjs',
 'accelerated-native-codec-probe.test.mjs',
 'accelerated-storage-budget.test.mjs',
 'accelerated-qa-recovery-ui.test.mjs',
 'accelerated-qa-export-ui.test.mjs',
 'accelerated-editor-native-gate.test.mjs',
 'accelerated-multitrack-parity.test.mjs',
 'accelerated-multitrack-renderer.test.mjs',
 'export-engine-policy.test.mjs'
];
const options=new Set(process.argv.slice(2));
const valid=new Set(['--list','--full','--build','--live']);
if([...options].some(x=>!valid.has(x))){
 console.error('Uso: node tools/wivra-accelerated-offline-check.cjs [--list] [--full] [--live] [--build]');
 process.exit(2);
}
const names=options.has('--full') && existsSync(suiteDir)
 ? [...new Set([...readdirSync(suiteDir).filter(x=>/^accelerated-.*\.test\.mjs$/.test(x)), 'export-engine-policy.test.mjs'])].sort()
 : basics;
// The --live option includes all checked-in streaming contracts, including
// Android LIVE scene/reconnection/MP4 regression tests. Resolve file names
// locally rather than relying on shell glob expansion (spawnSync shell=false).
const liveDir=join(root,'streaming','tests');
const liveNames=options.has('--live') && existsSync(liveDir)
 ? readdirSync(liveDir).filter(n=>n.endsWith('.test.mjs')).sort() : [];
if(options.has('--list')){
 console.log('Pruebas locales (sin GitHub Actions):');
 for(const name of names)console.log('  '+join('app','tests',name));
 if(options.has('--live'))for(const name of liveNames)
  console.log('  '+join('streaming','tests',name));
 console.log('Opcional: --live comprueba streaming/LIVE; --build reconstruye app/dist/agentcut.html local.');
 process.exit(0);
}
const missing=names.filter(n=>!existsSync(join(suiteDir,n)));
if(missing.length){
 console.error('Faltan archivos de pruebas en este checkout: '+missing.join(', '));
 console.error('Ejecuta desde un checkout completo de Wivra, no desde un directorio vacío.');
 process.exit(2);
}
function run(label,args){
 console.log('\nWivra local · '+label+' (sin CI, sin hardware real)');
 const child=spawnSync(process.execPath,args,{
  cwd:root,stdio:'inherit',timeout:20*60*1000,
  env:{...process.env,WIVRA_LOCAL_SMOKE:'1'}
 });
 if(child.error){console.error('No se pudo ejecutar '+label+': '+child.error.message);process.exit(1);}
 if(child.signal){console.error(label+' interrumpido: '+child.signal);process.exit(1);}
 if(child.status!==0){console.error(label+' falló (código '+child.status+').');process.exit(child.status||1);}
}
run('contratos accelerated export',['--test',...names.map(n=>join('app','tests',n))]);
if(options.has('--live')){
 if(!existsSync(liveDir)||!liveNames.length){
  console.error('No se encontraron pruebas streaming/LIVE en el checkout completo.');
  process.exit(2);
 }
 run('contratos streaming y Android LIVE',
  ['--test',...liveNames.map(n=>join('streaming','tests',n))]);
}
if(options.has('--build'))run('ensamblado HTML sin descargas ni paquetes nativos',['app/build.mjs']);
console.log('Verificación local completa. NO acredita H.264/AAC en teléfonos físicos, RTMP ni captura Ray-Ban.');
