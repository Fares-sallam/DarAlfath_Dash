import { Wrench, X } from 'lucide-react';
import {
  DEFAULT_MAINTENANCE_MESSAGE, DEFAULT_MAINTENANCE_TITLE, safeImageUrl, type MaintenanceSettings, type PopupSettings,
} from '@/lib/appControl';

/** A phone-shaped frame for the samples: only a sketch of how the app draws it (the real one is drawn by the app). */
const Phone = ({ children, testId, label }: { children: React.ReactNode; testId: string; label: string }) => (
  <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2" data-testid={testId}>
    <span className="text-xs font-semibold text-gray-600">{label}</span>
    <div className="mx-auto w-52 h-80 rounded-[28px] border-4 border-gray-800 bg-white overflow-hidden relative shadow-md" dir="rtl">
      {children}
    </div>
  </div>
);

/** The maintenance screen as the app shows it: the owner's words, or the house ones when left blank. */
export function MaintenanceSample({ maintenance }: { maintenance: MaintenanceSettings }) {
  return (
    <Phone testId="maintenance-sample" label="شكلها في التطبيق">
      <div className="h-full flex flex-col items-center justify-center text-center px-5 gap-3 bg-gradient-to-b from-sky-50 to-white">
        <div className="w-14 h-14 rounded-full bg-sky-100 flex items-center justify-center text-sky-700"><Wrench size={26} /></div>
        <div className="text-base font-bold text-gray-800" data-sample="title">{maintenance.title || DEFAULT_MAINTENANCE_TITLE}</div>
        <div className="text-xs text-gray-500 leading-relaxed whitespace-pre-line" data-sample="message">{maintenance.message || DEFAULT_MAINTENANCE_MESSAGE}</div>
        <div className="mt-2 px-4 py-2 rounded-full bg-sky-700 text-white text-xs font-bold">حاول تاني</div>
      </div>
    </Phone>
  );
}

/** The pop-up as the app shows it, over a dimmed home page. */
export function PopupSample({ popup }: { popup: PopupSettings }) {
  const hasLink = Boolean(popup.linkUrl && popup.linkUrl.trim());
  return (
    <Phone testId="popup-sample" label="شكلها في التطبيق">
      <div className="absolute inset-0 bg-gray-300/60" />
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl overflow-hidden">
        <span className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center"><X size={14} /></span>
        {safeImageUrl(popup.imageUrl) && <img src={popup.imageUrl!} alt="" className="w-full h-24 object-cover" data-sample="image" />}
        <div className="p-3 text-center space-y-1.5">
          {popup.title && <div className="text-sm font-bold text-gray-800" data-sample="title">{popup.title}</div>}
          {popup.message && <div className="text-[11px] text-gray-500 leading-relaxed whitespace-pre-line" data-sample="message">{popup.message}</div>}
          {!popup.title && !popup.message && !popup.imageUrl && <div className="text-[11px] text-gray-400">اكتب عنوان أو رسالة أو حط صورة</div>}
          {hasLink && <div className="mt-2 mx-auto px-4 py-1.5 rounded-full bg-sky-700 text-white text-[11px] font-bold w-fit" data-sample="button">{popup.buttonLabel || 'افتح'}</div>}
        </div>
      </div>
    </Phone>
  );
}
