// Embedded only in the pinned offline QA sidecar. Synthetic data, no gallery
// writes, no permissions, no network and no project contents in the report.
if(typeof document!=='undefined' && typeof window!=='undefined')
document.addEventListener('DOMContentLoaded',()=>{
  const settings=document.getElementById('sSettings');if(!settings)return;
  const make=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  const box=make('section','');box.id='wivraCodecDiagnostic';
  const title=make('strong','Diagnóstico MP4 H.264/AAC (QA)');
  const note=make('p','Prueba sintética de un segundo en este navegador. Comprueba configuración, codificación, archivo, audio decodificado y reproducción silenciada. No usa tus vídeos ni habilita el motor experimental. Cada resolución y FPS requiere su propia prueba.');
  const select=make('select','');select.setAttribute('aria-label','Resolución y FPS del diagnóstico');
  for(const [value,label] of [['320,240,30','320 × 240 · 30 FPS'],['320,240,60','320 × 240 · 60 FPS'],
    ['1280,720,30','720p · 30 FPS'],['1280,720,60','720p · 60 FPS'],
    ['1920,1080,30','1080p · 30 FPS'],['1920,1080,60','1080p · 60 FPS']]){
    const option=make('option',label);option.value=value;select.append(option);
  }
  const consent=make('label','');const enable=make('input','');enable.type='checkbox';
  enable.id='wivraCodecConsent';consent.append(enable,document.createTextNode('Ejecutar esta prueba sintética de códecs'));
  const start=make('button','Probar H.264/AAC');start.type='button';start.className='btn sec';start.id='wivraCodecStart';
  const cancel=make('button','Cancelar diagnóstico');cancel.type='button';cancel.hidden=true;
  const download=make('button','Descargar informe JSON');download.type='button';download.hidden=true;
  const status=make('p','');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const details=make('details',''),summary=make('summary','Informe sin datos del proyecto'),pre=make('pre','');
  pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';details.append(summary,pre);details.hidden=true;
  box.append(title,note,select,consent,start,cancel,status,download,details);settings.append(box);
  let running=false,cancelled=false,json='';
  let storage;try{storage=globalThis.localStorage;}catch{}
  const journal=createCodecDiagnosticJournal(storage);
  const showReport=report=>{
    json=JSON.stringify(report,null,2)+'\n';pre.textContent=json;details.hidden=false;download.hidden=false;
  };
  const interrupted=journal.recover();
  if(interrupted){
    showReport(interrupted);
    status.textContent='Diagnóstico anterior interrumpido en '+interrupted.failedStage+
      '. No se confirmó compatibilidad. Puedes descargar el informe o repetir la prueba.';
  }
  cancel.onclick=()=>{cancelled=true;status.textContent='Cancelando diagnóstico…';};
  download.onclick=()=>{
    if(!json)return;
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const anchor=make('a','');anchor.href=url;anchor.download='wivra-codec-diagnostic.json';anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  start.onclick=async()=>{
    if(running)return;
    if(wivraCodecMatrixRunning){status.textContent='La matriz de seis pruebas está en ejecución.';return;}
    if(!enable.checked){status.textContent='Marca primero la casilla para ejecutar el diagnóstico.';return;}
    const stable=document.getElementById('expGo'),native=document.getElementById('wivraQaStart');
    if(typeof expBusy!=='undefined'&&expBusy || stable?.disabled || native?.disabled){
      status.textContent='Termina la exportación actual antes del diagnóstico.';return;
    }
    const previous=[stable,native].filter(Boolean).map(n=>[n,n.disabled]);
    previous.forEach(([n])=>{n.disabled=true;});
    running=true;cancelled=false;start.disabled=true;select.disabled=true;cancel.hidden=false;
    download.hidden=true;details.hidden=true;json='';status.textContent='Comprobando configuración H.264/AAC…';
    try{
      const [width,height,fps]=select.value.split(',').map(Number);
      journal.begin({width,height,fps});
      const report=await runAcceleratedCodecDiagnostic({M:globalThis.Mediabunny,width,height,fps,
        isCancelled:()=>cancelled,onStage:stage=>{journal.stage(stage);status.textContent='Diagnóstico: '+stage+' ✓';}});
      journal.clear();showReport(report);
      status.textContent=report.outcome==='passed'
        ?'Muestra sintética verificada en este contexto. No confirma estabilidad en proyectos largos, sonido físico ni habilita producción.'
        :report.outcome==='cancelled'?'Diagnóstico cancelado. Puedes repetirlo.'
        :'Prueba detenida: '+report.failedStage+' / '+report.code+'. Continúa con el exportador habitual.';
    }catch{
      status.textContent='No se pudo completar el diagnóstico. El exportador habitual sigue disponible.';
    }finally{
      previous.forEach(([n,disabled])=>{n.disabled=disabled;});
      running=false;start.disabled=false;select.disabled=false;cancel.hidden=true;enable.checked=false;
    }
  };
});
