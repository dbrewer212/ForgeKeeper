import { beforeEach, describe, expect, it, vi } from 'vitest';
const camera = vi.hoisted(()=>({checkPermissions:vi.fn(),requestPermissions:vi.fn(),scan:vi.fn()}));
vi.mock('@tauri-apps/plugin-barcode-scanner',()=>({...camera,Format:{QRCode:'QR_CODE'}}));
import { scanCode } from './coreClient';

describe('camera scan lifecycle',()=>{
  beforeEach(()=>{
    vi.stubGlobal('window',{__TAURI_INTERNALS__:{}});
    vi.resetAllMocks(); camera.checkPermissions.mockResolvedValue('granted');
  });
  it('uses QR only for pairing and releases the scan guard after native failure',async()=>{
    camera.scan.mockRejectedValueOnce(Error('Camera unavailable')).mockResolvedValueOnce({content:'pairing'});
    await expect(scanCode(true)).rejects.toThrow('Camera unavailable');
    await expect(scanCode(true)).resolves.toBe('pairing');
    expect(camera.requestPermissions).not.toHaveBeenCalled();
    expect(camera.scan).toHaveBeenCalledWith({cameraDirection:'back',windowed:false,formats:['QR_CODE']});
  });
  it('does not open a camera after permission denial',async()=>{
    camera.checkPermissions.mockResolvedValue('prompt'); camera.requestPermissions.mockResolvedValue('denied');
    await expect(scanCode(true)).rejects.toThrow('Camera permission');
    expect(camera.scan).not.toHaveBeenCalled();
  });
  it('rejects overlapping taps without replacing the active scan',async()=>{
    let finish!:(value:{content:string})=>void;
    camera.scan.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    const pending=scanCode(true);
    await expect(scanCode(true)).rejects.toThrow('already open');
    await vi.waitFor(()=>expect(camera.scan).toHaveBeenCalledOnce());
    finish({content:'ok'}); await expect(pending).resolves.toBe('ok');
  });
});
