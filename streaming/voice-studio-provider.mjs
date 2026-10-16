/**
 * Wivra VoiceStudio narration adapter (OPTIONAL, explicit opt-in).
 *
 * Connects to a SEPARATELY hosted VoiceStudio OpenAI-compatible TTS endpoint.
 * This DOES NOT bundle VoiceStudio/AGPL code, install models, open microphones,
 * clone voices, upload recordings, write assets, edit the Claude timeline,
 * or connect to a desktop machine without the user's own server.
 *
 * API reference:
 * https://github.com/debpalash/VoiceStudio/blob/main/docs/agentic-voice.md
 * https://github.com/debpalash/VoiceStudio/blob/main/docs/api-auth.md
 *
 * HTTPS + a user-supplied backend key are mandatory for phone->server use.
 * Consumers of this module MUST store secrets using native secure storage,
 * verify the actual server identity and provide UI for explicit consent.
 */
const SERVICE='voicestudio';
const MAX_TEXT_LENGTH=4000;
const MAX_WAV_BYTES=16*1024*1024;
const FIELD_ID=/^[A-Za-z0-9._-]{1,100}$/;
const ALLOWED_FORMAT='wav';

function fail(message){throw new TypeError(message)}
function isRecord(x){return x!==null && typeof x==='object' && !Array.isArray(x)}
function validId(x,label){
  if(typeof x!=='string'||!FIELD_ID.test(x))fail(label+' must be a supported identifier');
}
function secureBase(url){
  if(typeof url!=='string'||url.length>400)fail('An HTTPS server URL is required');
  let u;
  try{u=new URL(url)}catch{fail('Invalid server URL')}
  if(u.protocol!=='https:'||!u.hostname||u.username||u.password||
     u.search||u.hash||u.pathname!=='/'&&u.pathname!==''){
    fail('A clean HTTPS server origin is required (no credentials, paths or query)');
  }
  return u.origin;
}

/** Metadata only. Never serializes server URL, text, tokens or personal voices. */
export function voiceStudioAdapterCapabilities(){
  return Object.freeze({
    provider:SERVICE,
    schemaVersion:'wivra-voice-provider-1',
    supportedWorkflows:Object.freeze(['text-to-speech']),
    preferredFormat:ALLOWED_FORMAT,
    responseMaxBytes:MAX_WAV_BYTES,
    requestTransport:'explicit-https-only',
    optionalRemoteServer:true,
    worksWithoutServer:false,
    nativeMobileUIConnected:false,
    installedVoiceStudioEngine:false,
    serverConnectivityVerified:false,
    generatedAudioImportedToWivra:false,
    voiceCloningImplemented:false,
    transcriptionImplemented:false,
    publishesLiveAudio:false,
    rawRecordingUploadImplemented:false
  });
}

/**
 * A pure no-PII plan for a UI/host to present BEFORE any upload happens.
 * Tokens, text, backend URL, or voice identities must never appear in it.
 */
export function createVoiceStudioNarrationPlan({
  platform='ios',
  textLength=0,
  model='tts-1',
  format=ALLOWED_FORMAT
}={}){
  if(!['ios','android'].includes(platform))fail('Only mobile Wivra is in scope');
  if(!Number.isInteger(textLength)||textLength<1||textLength>MAX_TEXT_LENGTH)
    fail('Narration text length must be 1 to '+MAX_TEXT_LENGTH+' characters');
  validId(model,'Model');
  if(format!==ALLOWED_FORMAT)fail('Only WAV is enabled for the first prototype');
  return Object.freeze({
    schemaVersion:'wivra-voice-narration-plan-1',
    provider:SERVICE,platform,
    mode:'optional-external-provider',
    format,model,
    characterCount:textLength,
    capturesOriginalAudio:false,
    changesTimeline:false,
    altersLiveAudio:false,
    requiresExternalServer:true,
    requiresEncryptedAuthenticatedLink:true,
    requiresPerRequestApproval:true,
    requiresSeparateVoiceRightsReview:true,
    requiresSeparateModelLicenseReview:true,
    readyToImport:false,
    caveat:'Preparing this plan does not transmit, synthesize or import speech.'
  });
}

/** Validate actual WAV bytes, not a header claiming audio/wav. */
function wav(bytes){
  return bytes.length>=12&&
    String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&
    String.fromCharCode(...bytes.subarray(8,12))==='WAVE';
}
async function limitedBytes(response){
  const advertised=response.headers?.get?.('content-length');
  if(advertised!==null && advertised!==undefined&&advertised!==''){
    const n=Number(advertised);
    if(!Number.isFinite(n)||n<0||n>MAX_WAV_BYTES)
      throw Error('WAV response exceeds size limit');
  }
  if(response.body?.getReader){
    const reader=response.body.getReader();
    let chunks=[],length=0;
    try{
      while(true){
        const {value,done}=await reader.read();
        if(done)break;
        if(!(value instanceof Uint8Array))throw Error('Invalid WAV response chunk');
        length+=value.byteLength;
        if(length>MAX_WAV_BYTES)throw Error('WAV response exceeds size limit');
        chunks.push(value);
      }
    }finally{
      try{await reader.cancel()}catch{/* response already finished */}
    }
    const data=new Uint8Array(length);let offset=0;
    for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length}
    return data;
  }
  const result=new Uint8Array(await response.arrayBuffer());
  if(result.length>MAX_WAV_BYTES)throw Error('WAV response exceeds size limit');
  return result;
}

/**
 * Makes ONE network request only after four explicit gates pass.
 *
 * Backend is user-run VoiceStudio on a trusted HTTPS endpoint.
 * apiKey stays only in the runtime request Authorization header.
 * No API call happens if any required option is absent or invalid.
 *
 * The caller must present another user confirmation before adding the WAV
 * to Claude's library/timeline. No automatic export, archive or LIVE mixing.
 */
export async function requestVoiceStudioNarration({
  platform='ios',
  backendUrl,
  apiKey,
  text,
  model='tts-1',
  voice='alloy',
  userApproved=false,
  voiceUseAuthorized=false,
  modelLicenseReviewed=false,
  requestedByUser=false
}={}, {fetchImpl=globalThis.fetch,signal}={}){
  if(userApproved!==true||requestedByUser!==true||
     voiceUseAuthorized!==true||modelLicenseReviewed!==true)
    fail('Narration requires user request, permission, voice rights and model terms review');
  if(typeof text!=='string'||!text.trim()||text.length>MAX_TEXT_LENGTH)
    fail('Narration text must be 1 to '+MAX_TEXT_LENGTH+' characters');
  if(typeof apiKey!=='string'||apiKey.length<16||apiKey.length>4096||
     /[\r\n]/.test(apiKey))
    fail('The user must configure a server API key in secure storage');
  validId(model,'Model');validId(voice,'Voice');
  const base=secureBase(backendUrl);
  createVoiceStudioNarrationPlan({platform,textLength:text.length,model});
  if(typeof fetchImpl!=='function')fail('A native network adapter is required');
  let response;
  try{
    response=await fetchImpl(base+'/v1/audio/speech',{
      method:'POST',
      redirect:'error',
      cache:'no-store',
      credentials:'omit',
      headers:{
        'Content-Type':'application/json',
        'Accept':'audio/wav',
        'Authorization':'Bearer '+apiKey
      },
      body:JSON.stringify({model,voice,input:text,response_format:'wav'}),
      signal
    });
  }catch{
    // Deliberately do not surface URLs, content or credential-bearing errors.
    throw Error('VoiceStudio HTTPS request could not be completed');
  }
  if(!response||response.ok!==true)
    throw Error('VoiceStudio server rejected narration or is unavailable');
  const mime=(response.headers?.get?.('content-type')||'').split(';')[0].toLowerCase().trim();
  if(!['audio/wav','audio/wave','audio/x-wav'].includes(mime))
    throw Error('VoiceStudio response is not confirmed WAV audio');
  const bytes=await limitedBytes(response);
  if(!wav(bytes))throw Error('VoiceStudio response has an invalid WAV signature');
  return Object.freeze({
    provider:SERVICE,
    format:ALLOWED_FORMAT,
    mime:'audio/wav',
    data:bytes,
    importedToEditor:false,
    liveAudioUsed:false,
    savedToDisk:false,
    note:'Generated WAV is in memory only. Importing it requires a separate user action.'
  });
}
