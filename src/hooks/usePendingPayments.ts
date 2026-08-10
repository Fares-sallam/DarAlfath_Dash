import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCountry } from '@/contexts/CountryContext';

/* ── Types ──────────────────────────────────────────────────────────────
 * محاولة دفع أونلاين قبل أن تتحوّل إلى طلب حقيقي.
 * كل صفّ هنا = عميل ضغط "ادفع" فعلاً. لو انتهى بغير `completed` فالعميل
 * حاول يشتري ولم ينجح — وهذه الشاشة هي المكان الوحيد الذي يُظهر ذلك.
 * ------------------------------------------------------------------- */
export interface PendingPayment {
  id: string;
  merchant_order_id: string;
  user_id: string | null;
  amount_cents: number;
  status: string;
  paymob_order_id: string | null;
  paymob_transaction_id: string | null;
  resulting_order_id: string | null;
  failure_reason: string | null;
  coupon_code: string | null;
  created_at: string;
  expires_at: string | null;
  completed_at: string | null;
  shipping_address: {
    name?: string;
    email?: string;
    phone?: string;
    governorate?: string;
    city?: string;
  } | null;
  countries?: { name: string; currency_symbol: string } | null;
}

/** الأعمدة المسموح بقراءتها في المتصفح.
 *  `paymob_client_secret` و `client_secret_hash` مستبعدان عمدًا: الأول
 *  بيانات اعتماد دفع حيّة تسمح بمتابعة جلسة الدفع، والثاني ما يُتحقق به
 *  من ملكيتها. لا شيء في هذه الشاشة يحتاجهما، فلا يغادران السيرفر. */
const SAFE_COLUMNS = `
  id,
  merchant_order_id,
  user_id,
  amount_cents,
  status,
  paymob_order_id,
  paymob_transaction_id,
  resulting_order_id,
  failure_reason,
  coupon_code,
  created_at,
  expires_at,
  completed_at,
  shipping_address,
  countries(name, currency_symbol)
`;

export interface PendingPaymentFilters {
  status?: string;
  search?: string;
}

export function usePendingPayments(filters: PendingPaymentFilters = {}) {
  const { selectedCountry } = useCountry();
  const qc = useQueryClient();

  // محاولات الدفع تتغيّر لحظيًا أثناء وجود الأدمن على الشاشة (webhook أو
  // انتهاء مهلة)، فالتحديث الفوري هنا ليس رفاهية.
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-pending-payments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pending_payments' },
        () => {
          void qc.invalidateQueries({ queryKey: ['pending-payments'] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  return useQuery({
    queryKey: ['pending-payments', selectedCountry?.id ?? 'all', filters],
    queryFn: async (): Promise<PendingPayment[]> => {
      let query = supabase
        .from('pending_payments')
        .select(SAFE_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(500);

      if (selectedCountry?.id) {
        query = query.eq('country_id', selectedCountry.id);
      }

      if (filters.status && filters.status !== 'الكل') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []) as unknown as PendingPayment[];
    },
  });
}

/* ── إحصاءات سريعة للبطاقات العلوية ── */
export interface PendingPaymentStats {
  stuck: number;        // معلّقة الآن — تحتاج نظرة
  failedToday: number;  // فشل/إلغاء خلال 24 ساعة
  completed: number;
  lostRevenue: number;  // قيمة ما لم يكتمل (بالجنيه)
}

export function summarizePendingPayments(rows: PendingPayment[]): PendingPaymentStats {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

  let stuck = 0;
  let failedToday = 0;
  let completed = 0;
  let lostRevenue = 0;

  for (const r of rows) {
    if (r.status === 'completed') {
      completed += 1;
      continue;
    }
    if (r.status === 'pending') stuck += 1;
    // كل ما ليس مكتملًا هو محاولة شراء ضائعة — هذا هو الرقم الذي يهم فعلاً.
    lostRevenue += r.amount_cents / 100;
    if (new Date(r.created_at).getTime() >= dayAgo) failedToday += 1;
  }

  return { stuck, failedToday, completed, lostRevenue };
}
