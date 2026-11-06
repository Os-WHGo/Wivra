// Wivra P0-W29. Safe, advisory reservation for experimental native v2.
// No production MediaRecorder caller imports this module. The Android/iOS
// bridge still independently checks real free space and output bytes.
import {exportEstimatedBytes} from './export.mjs';
export const ACCELERATED_STORAGE_MAX_BYTES=16*1024*1024*1024;
export const ACCELERATED_STORAGE_MARGIN_BYTES=16*1024*1024;
export const ACCELERATED_STORAGE_MARGIN_RATIO=1.15;

/** Reject a caller's inaccurate override BEFORE any native file is opened. */
export function planAcceleratedStorageReservation({
 seconds,width,height,fps,estimatedBytes,longForm=false
}={}) {
 // 180 s unless a long-form (≤ 60 min) export was explicitly requested (MU V4).
 if(typeof longForm!=='boolean')throw new Error('Modo largo inválido.');
 if(!Number.isFinite(seconds)||seconds<=0||seconds>(longForm?3600:180)||
    !Number.isSafeInteger(width)||width<=0||width>3840||
    !Number.isSafeInteger(height)||height<=0||height>3840||
    width*height>3840*2160||
    !Number.isSafeInteger(fps)||fps<12||fps>60)
   throw new Error('Parámetros de reserva acelerada fuera del modo QA móvil.');
 // Stable exportEstimatedBytes models the encoded video + 128kbps audio.
 // Retain the audio allowance even for a silent timeline, so a late source
 // change cannot quietly under-reserve mobile storage.
 const modeled=exportEstimatedBytes(seconds,{
  progressive:true,width,height,fps
 });
 if(!Number.isSafeInteger(modeled)||modeled<=0)
   throw new Error('Estimación codificada acelerada inválida.');
 const minimum=Math.ceil(modeled*ACCELERATED_STORAGE_MARGIN_RATIO+
  ACCELERATED_STORAGE_MARGIN_BYTES);
 if(!Number.isSafeInteger(minimum)||minimum>ACCELERATED_STORAGE_MAX_BYTES)
   throw new Error('Exportación acelerada supera el presupuesto de almacenamiento.');
 if(estimatedBytes===undefined||estimatedBytes===null)
   return {estimatedBytes:minimum,modeledBytes:modeled,
    safetyMarginBytes:minimum-modeled,source:'automatic'};
 if(!Number.isSafeInteger(estimatedBytes)||estimatedBytes<minimum||
    estimatedBytes>ACCELERATED_STORAGE_MAX_BYTES)
   throw new Error('Tamaño estimado inválido: Reserva manual insuficiente o inválida para exportación acelerada.');
 return {estimatedBytes,modeledBytes:modeled,
  safetyMarginBytes:estimatedBytes-modeled,source:'explicit'};
}
