import { describe, expect, it } from 'vitest';
import { describeMobileError, mobileFailure } from './mobileErrors';

describe('mobile native error reporting', () => {
  it('extracts native plugin messages and nested Rust errors', () => {
    expect(describeMobileError({message:'Could not bind the camera.',code:'CAMERA_BIND'})).toBe('Could not bind the camera.');
    expect(describeMobileError({error:{message:'Authentication required.'}})).toBe('Authentication required.');
    expect(mobileFailure('Verified HTTPS pairing',{message:'TLS trust check failed'}).message).toBe('Verified HTTPS pairing: TLS trust check failed');
  });
  it('keeps JavaScript errors and string rejections readable', () => {
    expect(describeMobileError(new Error('Camera unavailable'))).toBe('Camera unavailable');
    expect(describeMobileError('Scan cancelled.')).toBe('Scan cancelled.');
  });
  it('does not dump credentials from unknown objects or circular causes', () => {
    const error: Record<string,unknown> = {token:'PRIVATE_CREDENTIAL',certificate:'PRIVATE_CERT'};
    error.cause = error;
    expect(describeMobileError(error)).not.toContain('PRIVATE');
    expect(describeMobileError(error)).not.toContain('[object Object]');
    expect(describeMobileError({code:'CAMERA_UNAVAILABLE'})).toContain('CAMERA_UNAVAILABLE');
  });
  it('redacts credential-shaped messages and limits response size', () => {
    expect(describeMobileError({message:'Bearer PRIVATE_TOKEN'})).not.toContain('PRIVATE_TOKEN');
    expect(describeMobileError({message:'{"token":"PRIVATE_TOKEN"}'})).not.toContain('PRIVATE_TOKEN');
    expect(describeMobileError({message:'-----BEGIN CERTIFICATE-----PRIVATE_CERT-----END CERTIFICATE-----'})).not.toContain('PRIVATE_CERT');
    expect(describeMobileError('x'.repeat(3000))).toHaveLength(1200);
  });
});
