import { EyeOff, Layers } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { booksLabel, type HideBookPlan } from '@/lib/bundles';

interface HideBookDialogProps {
  bookTitle: string;
  /** What each bundle on sale that holds the book would go through. The dialog is open while there are any. */
  plan: HideBookPlan;
  onHideBookOnly: () => void;
  onHideFromBundlesToo: () => void;
  onCancel: () => void;
}

/**
 * A book inside bundles on sale can be hidden two ways:
 *  - as a product of its own only — the bundles keep it and keep selling it;
 *  - from the bundles too — it leaves them (each carries on with its other
 *    books; one that would be left with fewer than two is hidden instead).
 */
export default function HideBookDialog({ bookTitle, plan, onHideBookOnly, onHideFromBundlesToo, onCancel }: HideBookDialogProps) {
  const many = plan.bundles.length > 1;
  const label = many ? 'المجموعات' : 'المجموعة';
  const anyHidden = plan.bundles.some((b) => b.action === 'hide');

  return (
    <AlertDialog open={plan.bundles.length > 0} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent dir="rtl" className="max-w-lg text-right">
        <AlertDialogHeader className="text-right sm:text-right">
          <AlertDialogTitle>إخفاء «{bookTitle}»</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>الكتاب ده جزء من {label} اللي لسه معروضة للبيع:</p>
              <ul className="space-y-1.5">
                {plan.bundles.map((b) => (
                  <li key={b.id} className="flex items-start gap-2">
                    <Layers size={14} className="text-amber-600 flex-shrink-0 mt-1" />
                    <span>
                      <span className="text-gray-800 font-semibold">{b.title}</span>
                      <span className="block text-xs text-gray-500">
                        {b.action === 'trim'
                          ? `لو اتشال منها هتكمل بـ${booksLabel(b.booksLeft)}`
                          : 'لو اتشال منها هتبقى ناقصة (أقل من كتابين)، فهتتخفى هي كمان'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p>تحب الكتاب يتخفى إزاي؟</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <AlertDialogAction
            onClick={onHideFromBundlesToo}
            className="h-auto w-full flex-col items-start gap-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 text-right"
          >
            <span className="font-bold flex items-center gap-1.5">
              <EyeOff size={14} />
              يتخفي من {label} وككتاب فردي
            </span>
            <span className="text-xs font-normal text-red-100 whitespace-normal">
              بيتشال من {label}{anyHidden ? ' (والناقصة بتتخفى)' : ''} ومبيتباعش لوحده. سعر {label} مش بيتغير تلقائيًا، فراجعه.
              ولو فعّلته تاني بيرجع {many ? 'للمجموعات' : 'للمجموعة'} في نفس مكانه.
            </span>
          </AlertDialogAction>

          <AlertDialogAction
            onClick={onHideBookOnly}
            className="h-auto w-full flex-col items-start gap-1 bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 px-4 py-3 text-right"
          >
            <span className="font-bold">يتخفي ككتاب فردي لوحده ويفضل في {label}</span>
            <span className="text-xs font-normal text-gray-500 whitespace-normal">
              بيختفي من المتجر كمنتج لوحده، و{label} تفضل زي ما هي: بتتباع بيه وبتخصم من مخزونه.
            </span>
          </AlertDialogAction>
        </div>

        <AlertDialogFooter className="sm:justify-start">
          <AlertDialogCancel className="mt-0 w-full">إلغاء</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
