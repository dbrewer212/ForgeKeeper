import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { decodeQrPixels } from './qrPhoto';

describe('local pairing QR photo decoder', () => {
  it('reads a dense desktop pairing code including certificate newlines', () => {
    const text = JSON.stringify({schema:'foundry-mobile/1', endpoint:'https://10.0.0.2:8765',
      token:'a'.repeat(43), client_id:'fixture', certificate:'-----BEGIN CERTIFICATE-----\n'+'A'.repeat(1200)+'\n-----END CERTIFICATE-----\n'});
    const qr = QRCode.create(text, {errorCorrectionLevel:'L'});
    const side = (qr.modules.size + 8) * 4;
    const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y=0;y<qr.modules.size;y++) for (let x=0;x<qr.modules.size;x++) {
      if (!qr.modules.get(y,x)) continue;
      for (let dy=0;dy<4;dy++) for (let dx=0;dx<4;dx++) {
        const index = (((y+4)*4+dy)*side+(x+4)*4+dx)*4;
        pixels[index]=pixels[index+1]=pixels[index+2]=0;
      }
    }
    expect(decodeQrPixels(pixels,side,side)).toBe(text);
  });
  it('reports an unreadable photo without attempting a desktop connection', () => {
    expect(()=>decodeQrPixels(new Uint8ClampedArray(100*100*4).fill(255),100,100)).toThrow('No readable QR');
  });
});
