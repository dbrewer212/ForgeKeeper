import { BinaryBitmap, DecodeHintType, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';

export function decodeQrPixels(data: Uint8ClampedArray, width: number, height: number): string {
  const luminance = new Uint8ClampedArray(width * height);
  for (let pixel=0;pixel<luminance.length;pixel++) {
    const index=pixel*4;
    luminance[pixel]=(data[index]+2*data[index+1]+data[index+2])/4;
  }
  const source = new RGBLuminanceSource(luminance,width,height);
  const hints = new Map([[DecodeHintType.TRY_HARDER,true]]);
  for (const image of [source,source.invert()]) {
    try { return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(image)),hints).getText(); }
    catch { /* Try the opposite polarity before reporting an unreadable photo. */ }
  }
  throw Error('No readable QR found. Take a sharper photo with the whole code in view.');
}

/** Decode on this device. Pairing photos are never uploaded or saved by Foundry. */
export async function readQrPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
    throw Error('Choose a JPEG, PNG or WebP photo under 20 MB.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height) throw Error('This image is empty.');
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw Error('Could not read this photo.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return decodeQrPixels(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  } finally { bitmap.close(); }
}
