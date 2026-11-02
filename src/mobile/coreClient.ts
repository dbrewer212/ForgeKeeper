import { invoke } from '@tauri-apps/api/core';
import { scan, Format, checkPermissions, requestPermissions } from '@tauri-apps/plugin-barcode-scanner';

import { mobileFailure } from './mobileErrors';

let scanning = false;

export async function scanCode(pairing = false) {
  if (!('__TAURI_INTERNALS__' in window)) throw Error('Camera scanning is available in the installed Android app.');
  if (scanning) throw Error('A camera scan is already open.');
  scanning = true;
  try {
    let permission;
    try {
      permission = await checkPermissions() === 'granted' ? 'granted' : await requestPermissions();
    } catch (error) { throw mobileFailure('Camera permission check', error); }
    if (permission !== 'granted') throw Error('Camera permission is required. Enable it in Android app settings, then retry.');
    try {
      return (await scan({ cameraDirection: 'back', windowed: false,
        formats: pairing ? [Format.QRCode] : [Format.QRCode, Format.EAN13, Format.EAN8, Format.UPC_A, Format.UPC_E, Format.Code128, Format.DataMatrix] })).content;
    } catch (error) { throw mobileFailure('Camera scanner', error); }
  } finally { scanning = false; }
}

export async function pairCore(text: string) {
  if (text.length > 12000) throw Error('Pairing code exceeds its size limit.');
  const connection = JSON.parse(text);
  if (connection.schema !== 'foundry-mobile/1') throw Error('This is not a Foundry desktop pairing code.');
  try { return await invoke<{ scopes: string[] }>('core_pair', { connection }); }
  catch (error) { throw mobileFailure('Verified HTTPS pairing', error); }
}

export const coreRequest = async <T,>(path: string, body?: object): Promise<T> => {
  try { return await invoke<T>('core_request', { path, body: body ?? null }); }
  catch (error) { throw mobileFailure('Desktop request', error); }
};
export const coreStatus = () => invoke<{ paired: boolean; endpoint?: string; client_id?: string }>('core_connection_status');
export const forgetCore = () => invoke('core_forget');

export async function readLabel(file: File, progress: (value: string) => void) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 12 * 1024 * 1024) throw Error('Choose a JPEG, PNG or WebP label photo under 12 MB.');
  progress('Preparing label photo for your desktop…');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d'); if (!context) throw Error('Could not prepare the label photo.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const image_base64 = canvas.toDataURL('image/jpeg', .86).split(',')[1];
  if (image_base64.length > 2800000) throw Error('Photo is too large. Move closer to the label and retake it.');
  progress('Reading label on your paired Foundry desktop…');
  const result = await coreRequest<{ text: string }>('/v1/inventory/read-label', { image_base64 });
  return result.text;
}
