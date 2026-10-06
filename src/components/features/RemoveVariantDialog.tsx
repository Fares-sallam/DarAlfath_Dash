import { Trash2 } from 'lucide-react';
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
import { arabicCount } from '@/lib/bundles';

export interface RemoveVariantPrompt {
  /** The copy's key in the form. */
  key: string;
  name: string;
  /** Orders that contain this copy; -1 when that couldn't be checked. */
  orders: number;
}

interface RemoveVariantDialogProps {
  prompt: RemoveVariantPrompt | null;
  onConfirm: (key: string) => void;
  onCancel: () => void;
}

/**
 * Asked before removing a saved copy that has orders. When the book is saved
 * the copy is deleted, and an order line keeps its price and title but loses
 * its link to the copy (order_items.variant_id is set to null), which is what
 * a customer's access to a digital book they bought hangs on.
 */
export default function RemoveVariantDialog({ prompt, onConfirm, onCancel }: RemoveVariantDialogProps) {
  return (
    <AlertDialog open={prompt !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent dir="rtl" className="max-w-md text-right">
        <AlertDialogHeader className="text-right sm:text-right">
          <AlertDialogTitle>حذف النسخة «{prompt?.name}»؟</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                {prompt && prompt.orders > 0
                  ? `النسخة دي اتطلبت قبل كده في ${arabicCount(prompt.orders, { one: 'طلب واحد', two: 'طلبين', few: 'طلبات', many: 'طلب' })}.`
                  : 'مقدرتش أتأكد لو النسخة دي موجودة في طلبات قديمة.'}
              </p>
              <p>
                لو اتحذفت بعد الحفظ، الطلبات دي هتفضل زي ما هي لكن هتفقد ارتباطها بالنسخة، وده بيأثر على وصول
                العملاء للكتب الرقمية اللي اشتروها. لو عايز بس توقف بيعها، الأفضل تخفي الكتاب بدل ما تحذف النسخة.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-start gap-2">
          <AlertDialogAction
            onClick={() => prompt && onConfirm(prompt.key)}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Trash2 size={14} className="ml-1.5" />
            احذف النسخة
          </AlertDialogAction>
          <AlertDialogCancel className="mt-0">إلغاء</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
