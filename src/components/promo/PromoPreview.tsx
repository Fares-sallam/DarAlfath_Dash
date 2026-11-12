import { ArrowLeft } from 'lucide-react';

/**
 * The promo card as the app draws it (components/ui/PromoPanel.tsx there): a navy card, the words and the button on the
 * start (right) edge, the picture on the other. Light and dark mode have their own navy.
 */
export default function PromoPreview({
  title, subtitle, buttonLabel, image, dark,
}: { title: string; subtitle: string | null; buttonLabel: string | null; image: string | null; dark: boolean }) {
  const background = dark ? 'linear-gradient(135deg, #00193A, #00265A)' : 'linear-gradient(135deg, #054180, #0A5CA8)';
  const hasWords = !!(title.trim() || subtitle || buttonLabel);
  return (
    <div
      className="relative rounded-2xl overflow-hidden min-h-[164px] flex items-center gap-3 p-4 text-white max-w-[408px] w-full"
      style={{ background }}
      data-testid="promo-preview"
    >
      <div className="flex-1 min-w-0 space-y-1.5 pb-2">
        {title.trim() && <p className="text-xl font-extrabold leading-8 line-clamp-3">{title}</p>}
        {subtitle && <p className="text-[13px] leading-[21px] text-white/80 line-clamp-3">{subtitle}</p>}
        {buttonLabel && (
          <span className="inline-flex items-center gap-1.5 mt-1.5 px-4 py-2 rounded-full text-[13px] font-bold" style={{ background: '#2AA3AB', color: '#001C40' }}>
            {buttonLabel}
            <ArrowLeft size={14} />
          </span>
        )}
        {!hasWords && <p className="text-sm text-white/50">الكارت من غير كلام</p>}
      </div>
      {image && <img src={image} alt="" className="w-[150px] h-[140px] object-contain flex-shrink-0" />}
    </div>
  );
}
