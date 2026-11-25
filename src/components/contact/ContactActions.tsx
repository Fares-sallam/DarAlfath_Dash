import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Loader2, MessageCircle, PhoneCall, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { copyText, dialCodeForCountry, normalizePhone, telUrl, whatsappUrl } from '@/lib/contact';
import { printOrderInvoice } from '@/lib/invoiceActions';

/** A customer's number, with a button that copies it and one that starts a call. */
export function PhoneActions({ phone, name, countryName }: { phone: string | null | undefined; name?: string | null; countryName?: string | null }) {
  const [copied, setCopied] = useState(false);
  const dial = dialCodeForCountry(countryName);
  const call = telUrl(phone, dial);
  if (!phone?.trim()) return <span className="text-gray-300">—</span>;

  const copy = async () => {
    const number = normalizePhone(phone, dial)?.e164 ?? phone.trim();
    if (await copyText(number)) {
      setCopied(true);
      toast.success('تم نسخ رقم الهاتف');
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      toast.error('تعذّر النسخ. انسخ الرقم يدويًا.');
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5" data-testid="phone-actions">
      <span dir="ltr" className="text-sm text-gray-600" data-testid="phone-number">{phone}</span>
      <button
        type="button"
        onClick={copy}
        className="p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"
        title="نسخ رقم الهاتف"
        aria-label={`نسخ رقم ${name ?? 'العميل'}`}
        data-testid="phone-copy"
      >
        {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
      </button>
      {call ? (
        <a
          href={call}
          className="p-1 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50"
          title="اتصال بالعميل"
          aria-label={`اتصال بـ ${name ?? 'العميل'}`}
          data-testid="phone-call"
        >
          <PhoneCall size={13} />
        </a>
      ) : null}
    </span>
  );
}

const ICON_BUTTON = 'p-1.5 rounded-lg hover:bg-green-50 text-green-600';
const LABEL_BUTTON = 'btn-secondary flex items-center gap-1.5 text-sm';
const PILL_BUTTON = 'flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-xl text-xs font-semibold hover:bg-green-200 transition-colors flex-shrink-0';

/** Opens a WhatsApp chat with the customer: the app on a phone, WhatsApp Web or the desktop app on a computer. */
export function WhatsAppButton({ phone, name, countryName, text, variant = 'icon', label = 'واتساب' }: {
  phone: string | null | undefined;
  name?: string | null;
  countryName?: string | null;
  /** a first message written for the customer (they can change it before sending) */
  text?: string;
  variant?: 'icon' | 'labeled' | 'pill';
  label?: string;
}) {
  const href = whatsappUrl(phone, { text, dialCode: dialCodeForCountry(countryName) });
  const className = variant === 'icon' ? ICON_BUTTON : variant === 'pill' ? PILL_BUTTON : LABEL_BUTTON;
  const content: ReactNode = variant === 'icon' ? <MessageCircle size={14} /> : <><MessageCircle size={13} />{label}</>;
  if (!href) {
    return (
      <button type="button" onClick={() => toast.info('مفيش رقم هاتف صالح للعميل ده، فمينفعش نفتح واتساب.')} className={`${className} opacity-40`} title="واتساب (مفيش رقم)" data-testid="whatsapp-disabled">
        {content}
      </button>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} title={`واتساب مع ${name ?? 'العميل'}`} aria-label={`واتساب مع ${name ?? 'العميل'}`} data-testid="whatsapp-link">
      {content}
    </a>
  );
}

interface PickRow { id: string; created_at: string; total_price: number; status: string }

/**
 * Prints the invoice of a customer's order: straight away when there is one, and when there are several a short list (newest first)
 * to choose which.
 */
export function CustomerInvoiceButton({ orderIds, name, variant = 'icon' }: { orderIds: string[] | undefined; name?: string | null; variant?: 'icon' | 'labeled' }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<PickRow[] | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  const ids = orderIds ?? [];
  const className = variant === 'icon' ? 'p-1.5 rounded-lg hover:bg-gray-100 text-gray-600' : LABEL_BUTTON;

  const start = async () => {
    if (ids.length === 0) {
      toast.info(`${name ?? 'العميل'} لسه ما عملش طلبات، فمفيش فاتورة.`);
      return;
    }
    if (ids.length === 1) {
      await printOrderInvoice(ids[0]);
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.from('orders').select('id, created_at, total_price, status').in('id', ids).order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as PickRow[];
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) {
        // under the button, or above it when the list would run off the bottom of the screen
        const height = Math.min(320, 44 + list.length * 52);
        const below = rect.bottom + 6;
        const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
        setAnchor({ top, left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)) });
      } else {
        setAnchor({ top: 120, left: 16 });
      }
      setRows(list);
    } catch (e) {
      toast.error(`تعذّر تحميل طلبات العميل: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (id: string) => {
    setRows(null);
    await printOrderInvoice(id);
  };

  return (
    <>
      <button ref={buttonRef} type="button" onClick={start} disabled={busy} className={className} title="طباعة فاتورة" aria-label={`طباعة فاتورة ${name ?? 'العميل'}`} data-testid="invoice-button">
        {busy ? <Loader2 size={variant === 'icon' ? 14 : 13} className="animate-spin" /> : <Printer size={variant === 'icon' ? 14 : 13} />}
        {variant === 'labeled' ? 'طباعة فاتورة' : null}
      </button>
      {rows && anchor && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setRows(null)} />
          <div className="fixed z-[61] w-72 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 max-h-80 overflow-y-auto" style={{ top: anchor.top, left: anchor.left }} dir="rtl" data-testid="invoice-picker">
            <p className="text-xs font-bold text-gray-500 px-2 py-1.5">اختار الطلب اللي تطبع فاتورته</p>
            {rows.map((row) => (
              <button key={row.id} type="button" onClick={() => void pick(row.id)} className="w-full flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-blue-50 text-right" data-testid="invoice-pick">
                <Printer size={13} className="text-blue-600 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-gray-800 truncate" dir="ltr">{row.id}</span>
                  <span className="block text-[11px] text-gray-400">{new Date(row.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })} · {row.status}</span>
                </span>
                <span className="text-xs font-bold text-gray-700 tabular-nums">{Number(row.total_price).toLocaleString('en-US')}</span>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
