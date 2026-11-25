import { describe, expect, it } from 'vitest';
import { dialCodeForCountry, normalizePhone, telUrl, whatsappUrl } from './contact';

describe('normalizePhone', () => {
  it('a local Egyptian number gets its country code', () => {
    expect(normalizePhone('01099887766')).toEqual({ digits: '201099887766', e164: '+201099887766' });
    expect(normalizePhone('0109 988 7766')).toEqual({ digits: '201099887766', e164: '+201099887766' });
    expect(normalizePhone('010-5544-3322')?.digits).toBe('201055443322');
  });
  it('reads Arabic-Indic digits', () => {
    expect(normalizePhone('٠١٠٩٩٨٨٧٧٦٦')?.digits).toBe('201099887766');
  });
  it('keeps an international number as it is (+ or 00)', () => {
    expect(normalizePhone('+201099887766')?.digits).toBe('201099887766');
    expect(normalizePhone('00201099887766')?.digits).toBe('201099887766');
    expect(normalizePhone('+966 50 123 4567')?.digits).toBe('966501234567');
    expect(normalizePhone('00971501234567')?.digits).toBe('971501234567');
  });
  it('a number already starting with the country code is not given it twice', () => {
    expect(normalizePhone('201099887766')?.digits).toBe('201099887766');
  });
  it('a national number written without its zero gets the code', () => {
    expect(normalizePhone('1099887766')?.digits).toBe('201099887766');
  });
  it('uses the customer\'s own country for a local number', () => {
    expect(normalizePhone('0501234567', '966')?.digits).toBe('966501234567');
    expect(dialCodeForCountry('السعودية')).toBe('966');
    expect(dialCodeForCountry('بلد مش معروف')).toBe('20');
    expect(dialCodeForCountry(null)).toBe('20');
  });
  it('anything that cannot be a phone number is refused', () => {
    for (const bad of [null, undefined, '', '   ', 'abc', 'غير متوفر', '123', '+1', '0', '1234567890123456789']) {
      expect(normalizePhone(bad as string | null | undefined)).toBeNull();
    }
  });
});

describe('links', () => {
  it('WhatsApp opens on the number, with an optional message', () => {
    expect(whatsappUrl('01099887766')).toBe('https://wa.me/201099887766');
    expect(whatsappUrl('01099887766', { text: 'مرحبًا بك' })).toBe(`https://wa.me/201099887766?text=${encodeURIComponent('مرحبًا بك')}`);
    expect(whatsappUrl('0501234567', { dialCode: '966' })).toBe('https://wa.me/966501234567');
    expect(whatsappUrl('')).toBeNull();
    expect(whatsappUrl(null)).toBeNull();
  });
  it('a call link with the plus sign', () => {
    expect(telUrl('01099887766')).toBe('tel:+201099887766');
    expect(telUrl('nope')).toBeNull();
  });
});
