import { toast } from 'sonner';
import { fetchOrderForInvoice } from '@/hooks/useOrders';
import { printInvoice } from '@/lib/invoice';

/** Reads the order and opens the print window with its invoice, telling the owner what is happening. */
export async function printOrderInvoice(orderId: string): Promise<void> {
  const id = toast.loading('بجهّز الفاتورة...');
  try {
    const order = await fetchOrderForInvoice(orderId);
    if (!order) throw new Error('الطلب مش موجود');
    toast.dismiss(id);
    await printInvoice(order);
  } catch (e) {
    toast.error(`تعذّر تجهيز الفاتورة: ${(e as Error).message}`, { id });
  }
}
