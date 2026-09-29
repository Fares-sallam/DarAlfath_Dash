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

interface HideBookDialogProps {
  bookTitle: string;
  /** Bundles still on sale that contain the book. The dialog is open while there are any. */
  bundles: { id: string; title: string }[];
  onHideBookOnly: () => void;
  onHideBookAndBundles: () => void;
  onCancel: () => void;
}

/**
 * Hiding a book removes it from the store as a product of its own, but a
 * bundle that contains it keeps selling it (stock is what governs a bundle).
 * So the admin picks: hide just the book, or the bundles with it.
 */
export default function HideBookDialog({ bookTitle, bundles, onHideBookOnly, onHideBookAndBundles, onCancel }: HideBookDialogProps) {
  const many = bundles.length > 1;
  const label = many ? 'المجموعات' : 'المجموعة';

  return (
    <AlertDialog open={bundles.length > 0} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent dir="rtl" className="max-w-lg text-right">
        <AlertDialogHeader className="text-right sm:text-right">
          <AlertDialogTitle>إخفاء «{bookTitle}»</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>الكتاب ده جزء من {label} اللي لسه معروضة للبيع:</p>
              <ul className="space-y-1">
                {bundles.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 text-gray-700 font-semibold">
                    <Layers size={14} className="text-amber-600 flex-shrink-0" />
                    <span>{b.title}</span>
                  </li>
                ))}
              </ul>
              <p>تحب تعمل إيه؟</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <AlertDialogAction
            onClick={onHideBookOnly}
            className="h-auto w-full flex-col items-start gap-1 bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 px-4 py-3 text-right"
          >
            <span className="font-bold">إخفاء الكتاب بس</span>
            <span className="text-xs font-normal text-gray-500 whitespace-normal">
              بيختفي من المتجر كمنتج لوحده. {label} هتفضل تتباع وبيه، وبتخصم من مخزونه.
            </span>
          </AlertDialogAction>

          <AlertDialogAction
            onClick={onHideBookAndBundles}
            className="h-auto w-full flex-col items-start gap-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 text-right"
          >
            <span className="font-bold flex items-center gap-1.5">
              <EyeOff size={14} />
              إخفاء الكتاب و{many ? 'المجموعات كلها' : 'المجموعة كاملة'}
            </span>
            <span className="text-xs font-normal text-red-100 whitespace-normal">
              الكتاب و{label} بيختفوا من المتجر. لو رجّعت الكتاب بعدين، {label} هتفضل مخفية لحد ما تفعّلها بنفسك.
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
