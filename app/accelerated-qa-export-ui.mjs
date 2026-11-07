// Owner beta preference (2026-11-07): accelerated is the primary export button on
// compatible native QA surfaces, classical MediaRecorder remains one tap away.
// This is NOT an automatic production engine activation: native codecs, writer,
// verified output and physical acceptance keep their independent safety gates.
// All exports are started by an explicit user click. No camera/RTMP access.
export function validAcceleratedRecoveryEntry(item) {
  return typeof item?.name==='string' &&
    /^Wivra_Fast_[A-Za-z0-9_-]{6,80}\.(mp4|webm)$/.test(item.name) &&
    Number.isSafeInteger(item.bytes) && item.bytes>0 &&
    Number.isSafeInteger(item.durationMs) && item.durationMs>0;
}
if(typeof document!=='undefined' && typeof window!=='undefined')
document.addEventListener('DOMContentLoaded',()=>{
  const host=nativeHost();
  if(!host || !['ios','android'].includes(host.platform))return;
  const exportSheet=document.getElementById('sExp');
  const startStable=document.getElementById('expGo');
  const settings=document.getElementById('sSettings');
  if(!exportSheet || !startStable || !settings)return;
  const make=(tag,text,cls='')=>{
    const node=document.createElement(tag);
    node.textContent=text;
    if(cls)node.className=cls;
    return node;
  };
  const qaBox=make('section','','');
  qaBox.id='wivraAcceleratedQA';
  qaBox.style.cssText='border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0';
  const title=make('strong','Exportación rápida · beta de pruebas');
  const note=make('p','Preferido: WebCodecs + Mediabunny. Verifica los códecs y el archivo nativo antes de confirmar el resultado. Hasta 60 min con escritura progresiva cuando sea compatible. Aún falta validación física H.264/AAC. El motor clásico MediaRecorder sigue disponible y nunca se borran tus originales.','m');
  const consent=make('label','');
  consent.style.cssText='display:flex;align-items:center;gap:8px';
  const enable=document.createElement('input');enable.type='checkbox';
  enable.id='wivraQaEnable';
  // Owner-authorized beta: accelerated is preselected ONLY in the native QA UI.
  // No export begins until the user explicitly presses its button.
  enable.checked=true;
  consent.append(enable,
    document.createTextNode('Preferir motor acelerado para esta exportación (beta experimental)'));
  const sound=make('label','');
  sound.style.cssText='display:flex;align-items:center;gap:8px';
  const requireAudio=document.createElement('input');requireAudio.type='checkbox';
  requireAudio.id='wivraQaAudio';sound.append(requireAudio,
    document.createTextNode('El montaje debe contener audio; detener si falta'));
  const start=make('button','Exportar rápido (beta) · WebCodecs + Mediabunny','btn');
  start.type='button';start.id='wivraQaStart';
  // The stable button is secondary, but always remains selectable.
  startStable.textContent='Exportar con motor clásico (MediaRecorder)';
  startStable.classList.add('sec');
  const cancel=make('button','Cancelar exportación acelerada','btn sec');
  cancel.type='button';cancel.hidden=true;
  const status=make('p','','m');status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const actions=make('div','');
  const recoveryButton=make('button','Buscar videos acelerados recuperables','btn sec');
  recoveryButton.type='button';
  const recovered=make('div','','m');
  recovered.setAttribute('role','status');recovered.setAttribute('aria-live','polite');
  qaBox.append(title,note,consent,sound,start,cancel,status,actions,recoveryButton,recovered);
  startStable.insertAdjacentElement('beforebegin',qaBox);
  let running=false,cancelled=false;
  const listRecovered=async target=>{
    target.textContent='Verificando videos privados…';
    try{
      const response=await host.request({op:'listRecovered'});
      if(!Array.isArray(response?.files))throw Error('Catálogo nativo inválido');
      const items=response.files.filter(validAcceleratedRecoveryEntry).slice(0,100);
      target.replaceChildren();
      if(!items.length){target.textContent='No hay videos recuperables verificados.';return;}
      for(const item of items){
        const row=make('div','');
        const label=make('span',item.name+' ('+(item.bytes/1e6).toFixed(1)+' MB) ');
        const button=make('button',host.platform==='ios'?'Compartir copia':'Restaurar en galería','btn sec');
        button.type='button';
        button.onclick=async()=>{
          const message=host.platform==='ios'
            ?'¿Abrir Compartir para este video privado verificado?'
            :'¿Restaurar este archivo verificado a Movies/Wivra? Wivra creará una copia nueva.';
          if(!window.confirm(message))return;
          button.disabled=true;
          try{
            const response=await host.request({
              op:host.platform==='ios'?'shareRecovered':'restoreRecovered',
              name:item.name
            });
            if(host.platform==='ios' && response?.shared!==true)
              throw Error('Compartir no confirmado');
            if(host.platform==='android' && response?.restored!==true)
              throw Error('Restauración no confirmada');
            target.textContent=host.platform==='ios'
              ?'Se abrió Compartir. La copia privada no se ha eliminado.'
              :response.alreadyPublished===true
                ?'Este video ya estaba en Movies/Wivra. No se creó ninguna copia duplicada.'
                :'Video recuperado en Movies/Wivra. Revisa la galería.';
          }catch(error){
            // An uncertain native reply may mean the gallery copy succeeded.
            // Don't send the same request again without a user check.
            target.textContent='No se pudo confirmar: '+error.message+
              '. Revisa Fotos o la galería antes de intentar otra vez.';
          }
        };
        row.append(label,button);target.append(row);
      }
    }catch(error){target.textContent='Recuperación no disponible: '+error.message;}
  };
  recoveryButton.onclick=()=>listRecovered(recovered);
  const settingsRecovery=make('button','Recuperar exportaciones aceleradas (QA)','btn sec');
  settingsRecovery.type='button';
  const settingsResult=make('div','','m');
  settingsResult.setAttribute('role','status');
  settingsRecovery.onclick=()=>listRecovered(settingsResult);
  settings.append(settingsRecovery,settingsResult);
  cancel.onclick=()=>{cancelled=true;status.textContent='Cancelando sin publicar un archivo parcial…';};
  start.onclick=async()=>{
    if(running||!enable.checked)return void(status.textContent=
      'Marca primero la autorización experimental. La exportación habitual sigue disponible.');
    if(typeof session==='undefined'||!session||typeof expBusy!=='undefined'&&expBusy)
      return void(status.textContent='Abre primero un proyecto y termina cualquier exportación actual.');
    if(typeof pzMissing!=='undefined'&&pzMissing.length)
      return void(status.textContent='Faltan archivos originales: reimpórtalos antes de probar.');
    const originalSession=session,revision=session.project.revision;
    running=true;cancelled=false;start.disabled=true;startStable.disabled=true;cancel.hidden=false;
    actions.replaceChildren();status.textContent='Preparando la exportación acelerada…';
    try{
      // MU V4: projects longer than 3 min use the long-form mode (≤ 60 min, written in pieces).
      const projectSeconds=typeof totalDuration==='function'?totalDuration(originalSession.project):0;
      const result=await recordOnNative({
        project:originalSession.project,media,longForm:projectSeconds>180,
        expectAudio:requireAudio.checked,experimentalAccelerated:true,
        isCancelled:()=>cancelled||session!==originalSession||
          session.project.revision!==revision,
        onProgress:({pct,t,total})=>{
          status.textContent='Codificando: '+Math.round(Math.max(0,Math.min(1,pct||0))*100)+
            '% ('+Number(t||0).toFixed(1)+' / '+Number(total||0).toFixed(1)+' s)';
        }
      });
      if(result?.verifiedNative!==true || result?.saved?.verified!==true ||
         result?.verifiedOnDevice!==false)
        throw Error('El puente no confirmó la integridad del archivo experimental.');
      status.textContent='Archivo experimental verificado y guardado: '+
        (result.saved.displayName||'video')+' ('+
        (result.saved.bytes/1e6).toFixed(1)+' MB). No validado en hardware físico.';
      const share=make('button','Compartir archivo verificado','btn sec');
      share.type='button';
      share.onclick=async()=>{
        try{await host.request({op:'share',token:result.saved.token});}
        catch(error){status.textContent='Compartir no disponible: '+error.message;}
      };
      actions.append(share);
      if(host.platform==='ios' && result.mime==='video/mp4'){
        const photos=make('button','Guardar copia en Fotos (QA)','btn sec');
        photos.type='button';
        photos.onclick=async()=>{
          if(!window.confirm('¿Guardar una copia verificada en Fotos? El archivo privado permanecerá en Wivra.'))return;
          // Never silently retry uncertain Photos replies: this may duplicate.
          photos.disabled=true;
          try{
            const receipt=await saveVerifiedAcceleratedVideoToPhotos({
              host,saved:result.saved,userConfirmed:true
            });
            if(receipt.saved!==true)throw Error('Fotos no confirmó el guardado');
            photos.textContent='Guardado en Fotos ✓';
            status.textContent='Copia añadida a Fotos. Conserva el archivo privado original.';
          }catch(error){
            photos.textContent='Revisa Fotos o utiliza Compartir';
            status.textContent='No se confirmó el guardado: '+error.message+
              '. Revisa Fotos antes de repetir para evitar duplicados.';
          }
        };
        actions.append(photos);
      }
    }catch(error){status.textContent='No se completó la exportación acelerada: '+error.message+
      '. El motor clásico (MediaRecorder) está disponible en el botón inferior. No se ha cambiado automáticamente de motor para evitar archivos duplicados o resultados inciertos.';}
    finally{running=false;cancel.hidden=true;start.disabled=false;startStable.disabled=false;
      enable.checked=false;}
  };
});
