import { supabase } from '@/lib/supabase';

/**
 * Fires the customer-facing status-update email (شحن / توصيل / إلغاء) after
 * an order's status changes. Best-effort and non-blocking on purpose: the
 * order update itself has already succeeded by the time this runs, and a
 * flaky email send should never surface as a failed save to the admin.
 * The edge function itself is a no-op for any status outside the three
 * tracked ones, so it's safe to call this on every status write.
 */
export async function notifyOrderStatusChange(orderId: string, status: string): Promise<void> {
  try {
    await supabase.functions.invoke('send-order-status-email', {
      body: { orderId, status },
    });
  } catch (e) {
    console.warn('[orderStatusEmail] send-order-status-email invoke failed:', e);
  }
}

/**
 * Reads the order's current status straight from the DB right before an
 * update, so callers can tell whether a status write actually changed
 * anything (an admin re-saving the same status shouldn't re-send an email).
 */
export async function getCurrentOrderStatus(orderId: string): Promise<string | null> {
  const { data } = await supabase.from('orders').select('status').eq('id', orderId).maybeSingle();
  return (data as { status?: string } | null)?.status ?? null;
}
