// W71: optional six-case synthetic codec QA in the pinned OFFLINE QA build.
// No downloads or uploads except a JSON report explicitly requested by owner.
// No renderer activation, no native file writes, no real project media.
if(typeof document!=='undefined'&&typeof window!=='undefined')
document.addEventListener('DOMContentLoaded',()=>{
  const settings=document.getElementById('sSettings');if(!settings)return;
  const element=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
  const box=element('section');box.id='wivraCodecMatrix';
  const title=element('strong','Matriz de compatibilidad H.264/AAC (QA)');
  const note=element('p','Seis pruebas sintéticas en orden: 320p, 720p y 1080p a 30/60 FPS. Cada una comprueba imagen y audio MP4 de un segundo. No prueba videos largos, galería, calor, batería ni certifica el teléfono.');
  const consent=element('label');
  const consentInput=element('input');consentInput.type='checkbox';consentInput.id='wivraCodecMatrixConsent';
  consent.append(consentInput,document.createTextNode('Autorizo las seis pruebas sintéticas locales'));
  const start=element('button','Ejecutar las seis pruebas');start.type='button';start.className='btn sec';
  start.id='wivraCodecMatrixStart';
  const cancel=element('button','Cancelar matriz');cancel.type='button';cancel.hidden=true;
  const download=element('button','Descargar matriz JSON');download.type='button';download.hidden=true;
  const status=element('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const details=element('details'),summary=element('summary','Informe sintético'),pre=element('pre');
  pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
  details.append(summary,pre);details.hidden=true;
  box.append(title,note,consent,start,cancel,status,download,details);settings.append(box);
  let running=false,cancelled=false,json='';
  let storage;try{storage=globalThis.localStorage;}catch{}
  const journal=createCodecDiagnosticJournal(storage);
  cancel.onclick=()=>{cancelled=true;status.textContent='Cancelando después del caso actual…';};
  download.onclick=()=>{
    if(!json)return;
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const a=element('a');a.href=url;a.download='wivra-codec-matrix-qa.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  start.onclick=async()=>{
    if(running||wivraCodecMatrixRunning)return;
    if(!consentInput.checked){status.textContent='Autoriza las seis pruebas locales.';return;}
    const stable=document.getElementById('expGo'),native=document.getElementById('wivraQaStart');
    const single=document.getElementById('wivraCodecStart');
    if(codecDiagnosticRunning||(typeof expBusy!=='undefined'&&expBusy)||
       stable?.disabled||native?.disabled||single?.disabled){
      status.textContent='Termina el diagnóstico o la exportación actual primero.';return;
    }
    const previous=[stable,native,single].filter(Boolean).map(n=>[n,n.disabled]);
    previous.forEach(([n])=>{n.disabled=true;});
    running=true;cancelled=false;start.disabled=true;cancel.hidden=false;
    download.hidden=true;details.hidden=true;json='';
    try{
      const matrix=await runAcceleratedCodecMatrix({
        diagnose:options=>runAcceleratedCodecDiagnostic({...options,M:globalThis.Mediabunny}),
        isCancelled:()=>cancelled,
        onCaseStart:test=>{
          journal.begin(test);
          status.textContent='Probando '+test.width+' × '+test.height+' · '+test.fps+' FPS…';
        },
        onStage:(_test,stage)=>journal.stage(stage),
        onCaseDone:(test,result)=>{
          journal.clear();
          status.textContent=test.id+': '+result.outcome+(result.code?' / '+result.code:'');
        }
      });
      journal.clear();
      const audit=auditAcceleratedCodecMatrix(matrix);
      if(!audit.valid)throw new Error('matrix-validation-failed');
      json=JSON.stringify(matrix,null,2)+'\n';
      pre.textContent=json;details.hidden=false;download.hidden=false;
      status.textContent=matrix.outcome==='cancelled'
        ?'Matriz cancelada: los casos restantes NO se ejecutaron.'
        :matrix.fullMatrixPassed
        ?'Seis muestras sintéticas aprobadas en este contexto. Falta exportación real, recuperación y prueba física. Motor de producción sin cambios.'
        :'Matriz con pruebas no aprobadas. El exportador habitual sigue disponible.';
    }catch{
      journal.clear();
      status.textContent='No se completó la matriz de pruebas. Sin cambios en exportación normal.';
    }finally{
      previous.forEach(([n,disabled])=>{n.disabled=disabled;});
      running=false;start.disabled=false;cancel.hidden=true;consentInput.checked=false;
    }
  };
});
