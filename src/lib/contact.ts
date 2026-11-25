// Reaching a customer from the dashboard: the number written for a link that works (a phone call, WhatsApp) and copying it.
// Pure helpers except `copyText`. A number is read the way a person writes it: Arabic-Indic digits, spaces, dashes, a local zero
// (01099887766), `+20…` or `0020…`; the country's code is added to a local number (Egypt unless the customer's country says otherwise).

export interface PhoneParts {
  /** the number with its country code and nothing else, for wa.me and tel: (e.g. 201099887766) */
  digits: string;
  /** the same with a plus sign (+201099887766) */
  e164: string;
}

/** Dialling codes of the countries the shop sells in (by the name the dashboard shows); anything else is read as Egypt. */
const DIAL_CODES: Record<string, string> = {
  مصر: '20', السعودية: '966', 'المملكة العربية السعودية': '966', الإمارات: '971', 'الإمارات العربية المتحدة': '971',
  الكويت: '965', قطر: '974', البحرين: '973', عُمان: '968', عمان: '968', الأردن: '962', لبنان: '961', ليبيا: '218',
  السودان: '249', المغرب: '212', الجزائر: '213', تونس: '216', العراق: '964', فلسطين: '970', اليمن: '967',
};

export const DEFAULT_DIAL_CODE = '20';

export function dialCodeForCountry(name?: string | null): string {
  return (name && DIAL_CODES[name.trim()]) || DEFAULT_DIAL_CODE;
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN = '۰۱۲۳۴۵۶۷۸۹';
const toLatinDigits = (value: string) =>
  value.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d))).replace(/[۰-۹]/g, (d) => String(EASTERN.indexOf(d)));

/** The number as a link needs it, or null when it cannot be a phone number (too short, too long, letters). */
export function normalizePhone(raw: string | null | undefined, dialCode: string = DEFAULT_DIAL_CODE): PhoneParts | null {
  if (!raw) return null;
  const text = toLatinDigits(String(raw)).trim();
  if (!text || /[A-Za-z؀-ۿ]/.test(text)) return null;
  const international = text.startsWith('+') || text.replace(/[\s\-().]/g, '').startsWith('00');
  let digits = text.replace(/\D/g, '');
  if (!digits) return null;

  if (text.startsWith('+')) {
    // already international
  } else if (international) {
    digits = digits.replace(/^00/, '');
  } else if (digits.startsWith('0')) {
    digits = `${dialCode}${digits.replace(/^0+/, '')}`;
  } else if (!digits.startsWith(dialCode) || digits.length <= dialCode.length + 7) {
    // a national number written without its zero (1099887766)
    digits = `${dialCode}${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return { digits, e164: `+${digits}` };
}

/** The link that opens WhatsApp on a phone (the app) and on a computer (WhatsApp Web or the desktop app), or null without a usable number. */
export function whatsappUrl(phone: string | null | undefined, options: { text?: string; dialCode?: string } = {}): string | null {
  const parts = normalizePhone(phone, options.dialCode);
  if (!parts) return null;
  return `https://wa.me/${parts.digits}${options.text ? `?text=${encodeURIComponent(options.text)}` : ''}`;
}

/** The link that starts a phone call, or null without a usable number. */
export function telUrl(phone: string | null | undefined, dialCode?: string): string | null {
  const parts = normalizePhone(phone, dialCode);
  return parts ? `tel:${parts.e164}` : null;
}

/** Puts text on the clipboard (the browser's own, or a hidden field where that is not allowed); true when it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the older way
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  }
}
