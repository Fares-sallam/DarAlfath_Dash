import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { uploadSeriesCover } from '@/hooks/useSeries';
import { compressImage } from '@/lib/imageCompression';

/** A picture to upload, replace or take off: the file is shrunk and stored, and the address is handed back (nothing else is saved here). */
export default function PicturePicker({ value, onChange, label = 'الصورة', shape = 'square', testId = 'picture-picker' }: {
  value: string | null;
  onChange: (next: string | null) => void;
  label?: string;
  shape?: 'square' | 'wide';
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadSeriesCover(await compressImage(file)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر رفع الصورة');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      <div className={`${shape === 'wide' ? 'w-28 h-16' : 'w-16 h-16'} rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0`}>
        {value ? <img src={value} alt="" className="w-full h-full object-contain" /> : <ImagePlus size={20} className="text-gray-300" />}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" aria-label={label} data-testid={`${testId}-file`} onChange={(e) => void pick(e.target.files?.[0])} />
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60" data-testid={`${testId}-upload`}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {value ? 'تغيير الصورة' : 'رفع صورة'}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50" data-testid={`${testId}-remove`}>
            <Trash2 size={13} /> إزالة
          </button>
        )}
      </div>
    </div>
  );
}
