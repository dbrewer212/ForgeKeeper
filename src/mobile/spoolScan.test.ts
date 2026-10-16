import { describe, expect, it } from 'vitest';
import { extractLabel, scanIdentity, complete, blankFields, validGtin } from './spoolScan';
describe('phone spool intake', () => {
  it('extracts printed fields without inventing missing specifications', () => {
    expect(extractLabel('eSUN\nPLA PLUS\nColor: Black\nDiameter 1.75mm\nNet 1kg')).toEqual({brand:'eSUN', material:'PLA+',color:'Black',diameter_mm:1.75,nominal_grams:1000});
    expect(extractLabel('unreadable label')).toEqual({});
    expect(extractLabel('SUNLU PLA+\n1.75 mm 1000 g').material).toBe('PLA+');
    expect(complete(blankFields())).toBe(false);
  });
  it('checks product barcodes and never treats product codes as spool identity', () => {
    expect(validGtin('4006381333931')).toBe(true);
    expect(validGtin('4006381333932')).toBe(false);
    expect(scanIdentity('4006381333931').kind).toBe('product');
    expect(scanIdentity('FF-SP-1234ABCD').kind).toBe('spool');
    expect(scanIdentity('https://example.com/spool').kind).toBe('unknown');
  });
});
