/**
 * AgentCut experiment: deterministic, permission-scoped editor commands.
 * This is NOT an LLM; adapters can provide the same validated tool actions.
 * Never upload, delete or mutate source files. — ChatGPT
 */
const numeric=n=>typeof n==="number"&&Number.isFinite(n);
const sec=v=>{const s=String(v),parts=s.split(":").map(Number);return parts.length===2?parts[0]*60+parts[1]:Number(s)};
const precision=n=>Math.round(n*100)/100;
export function inspectProject(input){
 const {duration,start=0,end=duration,text="",keepAudio=true,resolution=720,width=null,height=null,sourceName=""}=input||{};
 if(!numeric(duration)||duration<=0)throw new RangeError("No video loaded");
 return {duration,start,end,text,keepAudio,resolution,width,height,sourceName};
}
export function validateEdit(state, actions){
 const draft={...inspectProject(state)};
 if(!Array.isArray(actions)||!actions.length)throw new Error("No operations provided");
 if(actions.length>8)throw new Error("Maximum 8 edits per plan");
 for(const action of actions){
   if(!action||typeof action!=="object")throw new Error("Invalid operation");
   switch(action.tool){
     case "set_trim": {
       const {start,end}=action;
       if(!numeric(start)||!numeric(end)||start<0||end>draft.duration+.05||end-start<.2)
         throw new RangeError("Recorte fuera del video o demasiado corto");
       draft.start=precision(start);draft.end=precision(Math.min(end,draft.duration));break;
     }
     case "set_text": {
       if(typeof action.text!=="string"||action.text.length>120)throw new Error("Texto no válido (máx. 120 caracteres)");
       draft.text=action.text;break;
     }
     case "set_audio": {
       if(typeof action.enabled!=="boolean")throw new Error("Audio debe ser verdadero o falso");
       draft.keepAudio=action.enabled;break;
     }
     case "set_resolution": {
       if(![480,720].includes(action.maxDimension))throw new Error("La prueba admite solo 480 o 720");
       draft.resolution=action.maxDimension;break;
     }
     default:throw new Error("Herramienta no autorizada: "+String(action.tool));
   }
 }
 return draft;
}
export function parseInstruction(prompt,state){
 const text=String(prompt??"").trim();
 if(!text)throw new Error("Escribe una instrucción");
 const ops=[];
 // Explicit ranges only: unknown intents must NEVER be silently guessed.
 const cut=text.match(/\b(?:corta|recorta|acorta|deja|trim|cut)\b[^\n]{0,70}?\b(?:entre|desde|de|from)\s+(\d{1,3}(?::\d{1,2}(?:\.\d+)?)?|\d+(?:\.\d+)?)\s*(?:s|segundos?|seconds?)?\s+(?:a|hasta|y|to|and)\s+(\d{1,3}(?::\d{1,2}(?:\.\d+)?)?|\d+(?:\.\d+)?)\b/i);
 if(cut)ops.push({tool:"set_trim",start:sec(cut[1]),end:sec(cut[2])});
 const quoted=text.match(/\b(?:pon|agrega|añade|coloca|escribe|put|add)\s+(?:un\s+)?(?:texto|título|titulo|caption|text)\s*[:]?\s*["“'«]([^"”'»]{0,120})["”'»]/i);
 if(quoted)ops.push({tool:"set_text",text:quoted[1]});
 if(/\b(?:quita|elimina|silencia|sin|mute|remove)\s+(?:el\s+)?(?:audio|sonido|sound)\b/i.test(text))ops.push({tool:"set_audio",enabled:false});
 else if(/\b(?:activa|conserva|mant[eé]n|keep|enable)\s+(?:el\s+)?(?:audio|sonido|sound)\b/i.test(text))ops.push({tool:"set_audio",enabled:true});
 const res=text.match(/\b(?:resoluci[oó]n|exporta|calidad|export)\s+(?:a\s+|en\s+)?(480|720)\s*p?\b/i);
 if(res)ops.push({tool:"set_resolution",maxDimension:Number(res[1])});
 if(!ops.length)throw new Error("Esta prueba aún no comprende esa orden. Prueba: Recorta desde 2 hasta 8 y pon texto \"Vancouver\". El análisis semántico con una IA avanzada está pendiente.");
 return {proposed:ops,next:validateEdit(state,ops),interpretedBy:"parser_local_experimental",requiresApproval:true,
   notice:"Plan preliminar por reglas: no es una IA multimodal ni ha visto el contenido."};
}
export function suggestedWindows(sceneChanges,duration,{before=3,after=7,maxResults=3}={}){
 if(!numeric(duration)||duration<=0)throw new Error("Invalid duration");
 const valid=(sceneChanges||[]).filter(v=>numeric(v.time)&&v.time>=0&&v.time<=duration&&numeric(v.delta))
   .sort((a,b)=>b.delta-a.delta).slice(0,maxResults);
 return valid.map((v,index)=>({
   id:"candidate-"+(index+1),
   start:precision(Math.max(0,v.time-before)),
   end:precision(Math.min(duration,v.time+after)),
   evidence:"cambio visual estimado (muestreo local)",
   inspectedAt:precision(v.time),
   confidence:"experimental_not_semantic",
   tool:"set_trim"
 })).filter(v=>v.end-v.start>=.2);
}
