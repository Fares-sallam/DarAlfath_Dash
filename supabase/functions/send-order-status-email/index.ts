// ════════════════════════════════════════════════════════════════════════
//  send-order-status-email
//  ──────────────────────────────────────────────────────────────────────
//  Emails the customer when their order reaches one of three tracked
//  status changes — shipped, delivered, or cancelled. Order-confirmation
//  emails (on order creation) are a separate concern, handled by
//  send-order-email; this function only fires on a later status update.
//
//  Trigger: called DIRECTLY from the dashboard (browser) right after a
//  successful `orders.status` update (useUpdateOrder / useCreateShipment /
//  useUpdateShipment in DarAlfath_Dash), whenever the new status is one of
//  the three tracked values below and actually differs from what it was.
//  Unlike send-order-email (server-to-server, gated by
//  INTERNAL_FUNCTION_SECRET), this is called from a browser session, so it
//  authenticates the caller the same way delete-account does: resolve the
//  user from their own bearer token, then require admin — replicating
//  public.is_admin()'s own checks here, since that SQL function relies on
//  auth.uid()/auth.jwt(), which only resolve inside the caller's own RLS
//  session, not from this service-role client.
//
//  Any other status value (جديد، قيد المراجعة، تم التأكيد، مرتجع، …) is a
//  deliberate no-op — those aren't customer-facing milestones the business
//  asked to notify on, so this returns { skipped: true } rather than an
//  error, and the caller shouldn't treat that as a failure.
// ════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { corsHeaders } from '../_shared/cors.ts';

const GMAIL_USER         = Deno.env.get('GMAIL_USER')         ?? '';
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? '';
const SITE_URL           = Deno.env.get('SITE_URL')           ?? 'https://dar-alfath-client.vercel.app';
const OWNER_EMAIL  = 'faresalsaid780@gmail.com';
const ADMIN_ROLES  = ['super_admin', 'admin', 'manager'];

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── The four tracked transitions. Keyed by the exact status string the
//    dashboard writes to orders.status (see DarAlfath_Dash's useShipping.ts /
//    useOrders.ts) — anything else is intentionally not handled here. Note
//    "confirmed" here is distinct from send-order-email's order-creation
//    confirmation: this one fires when an admin explicitly moves the order
//    to تم التأكيد from the dashboard, which can be well after creation (or
//    never, if the admin ships straight from جديد). ─────────────────────
type TrackedKind = 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

const STATUS_TO_KIND: Record<string, TrackedKind> = {
  'تم التأكيد': 'confirmed',
  'جاري الشحن': 'shipped',
  'تم الشحن':   'shipped',
  'تم التوصيل': 'delivered',
  'ملغي':       'cancelled',
};

const COPY: Record<TrackedKind, {
  emoji: string;
  accent: string;
  subject: (orderId: string) => string;
  headline: string;
  bodyHtml: (customerName: string, orderId: string, tracking?: string, company?: string) => string;
}> = {
  confirmed: {
    emoji: '🎉',
    accent: '#16A34A',
    subject: (id) => `Dar Alfath - Order #${id} confirmed`,
    headline: 'تم تأكيد طلبك',
    bodyHtml: (name, id) => `
      أهلاً ${escapeHtml(name)},<br>
      تم تأكيد طلبك رقم <strong>${escapeHtml(id)}</strong> وجاري تجهيزه الآن. هنبعتلك تحديث تاني أول ما يتحرك للشحن.
    `,
  },
  shipped: {
    emoji: '🚚',
    accent: '#3B82F6',
    subject: (id) => `Dar Alfath - Order #${id} is on its way`,
    headline: 'طلبك في الطريق إليك',
    bodyHtml: (name, id, tracking, company) => `
      أهلاً ${escapeHtml(name)},<br>
      بدأنا شحن طلبك رقم <strong>${escapeHtml(id)}</strong>${company ? ` مع <strong>${escapeHtml(company)}</strong>` : ''}.
      ${tracking ? `<br>رقم التتبع: <strong style="font-family:monospace">${escapeHtml(tracking)}</strong>` : ''}
    `,
  },
  delivered: {
    emoji: '✅',
    accent: '#16A34A',
    subject: (id) => `Dar Alfath - Order #${id} delivered`,
    headline: 'تم توصيل طلبك بنجاح',
    bodyHtml: (name, id) => `
      أهلاً ${escapeHtml(name)},<br>
      وصل طلبك رقم <strong>${escapeHtml(id)}</strong> بنجاح. نتمنى إنه يعجبك، وشكراً لثقتك في دار الفتح.
    `,
  },
  cancelled: {
    emoji: '⚠️',
    accent: '#DC2626',
    subject: (id) => `Dar Alfath - Order #${id} cancelled`,
    headline: 'تم إلغاء طلبك',
    bodyHtml: (name, id) => `
      أهلاً ${escapeHtml(name)},<br>
      نأسف لإبلاغك أنه تم إلغاء طلبك رقم <strong>${escapeHtml(id)}</strong>.
      لو دفعت إلكترونيًا، هيتم رد المبلغ خلال أيام العمل القادمة. لو عندك أي استفسار، تواصل معنا وهنساعدك فورًا.
    `,
  },
};

function buildEmailHtml(kind: TrackedKind, customerName: string, orderId: string, tracking?: string, company?: string): string {
  const c = COPY[kind];
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(c.headline)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Cairo','Segoe UI',Tahoma,sans-serif;color:#0f172a">
<div style="max-width:600px;margin:0 auto;padding:24px">

  <div style="background:linear-gradient(135deg,${c.accent} 0%,${c.accent} 100%);color:white;padding:28px 24px;border-radius:16px 16px 0 0;text-align:center">
    <h1 style="margin:0 0 8px;font-size:22px">دار الفتح للنشر والتوزيع</h1>
    <p style="margin:0;opacity:.9;font-size:16px">${c.emoji} ${escapeHtml(c.headline)}</p>
  </div>

  <div style="background:white;padding:28px 24px;border:1px solid #e2e8f0">
    <p style="margin:0 0 16px;line-height:1.9;color:#334155;font-size:15px">
      ${c.bodyHtml(customerName, orderId, tracking, company)}
    </p>

    <div style="background:#f8fafc;padding:16px;border-radius:12px;margin:20px 0">
      <div style="font-size:12px;color:#64748b">رقم الطلب</div>
      <div style="font-weight:700;font-family:monospace;margin-top:2px">${escapeHtml(orderId)}</div>
    </div>

    <div style="text-align:center;margin-top:24px">
      <a href="${SITE_URL}/account/orders" style="display:inline-block;background:${c.accent};color:white;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600">
        عرض طلباتي
      </a>
    </div>
  </div>

  <div style="text-align:center;padding:20px;color:#64748b;font-size:12px;background:white;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;border-top:none">
    <p style="margin:0">دار الفتح للنشر والتوزيع — ${new Date().getFullYear()}</p>
  </div>

</div>
</body>
</html>`;
}

async function sendViaSmtp(to: string, subject: string, html: string) {
  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port:     465,
      tls:      true,
      auth: {
        username: GMAIL_USER,
        password: GMAIL_APP_PASSWORD,
      },
    },
  });

  try {
    await client.send({
      // ASCII-only display name — denomailer's header encoder mis-folds long
      // non-ASCII Subject/From values (confirmed live: an Arabic subject
      // arrived as raw undecoded quoted-printable, corrupting the whole
      // message). The Arabic branding lives in the HTML body instead, which
      // isn't subject to this header-folding bug.
      from:    `Dar Alfath <${GMAIL_USER}>`,
      to,
      subject,
      content: 'text/html',
      html,
    });
  } finally {
    await client.close();
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Resolve the caller from their own token, then require admin ────────
    // (replicates public.is_admin() — see the header note on why it can't
    // just be called as-is from this service-role client).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: callerData, error: callerErr } = await supabase.auth.getUser(token);
    const caller = callerData?.user;
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let isAdmin = caller.email === OWNER_EMAIL;
    if (!isAdmin) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', caller.id)
        .maybeSingle();
      isAdmin = !!profile?.role && ADMIN_ROLES.includes(profile.role);
    }
    if (!isAdmin) {
      const { data: adminSetting } = await supabase
        .from('admin_settings')
        .select('user_id')
        .eq('user_id', caller.id)
        .maybeSingle();
      isAdmin = !!adminSetting;
    }
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { orderId, status } = (await req.json()) as { orderId?: string; status?: string };
    if (!orderId || !status) {
      return jsonOk({ error: 'orderId و status مطلوبين' });
    }

    const kind = STATUS_TO_KIND[status];
    if (!kind) {
      // Not one of the three tracked milestones — nothing to send.
      return jsonOk({ skipped: true, reason: `untracked status: ${status}` });
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.warn('[status-email] GMAIL_USER or GMAIL_APP_PASSWORD not set — skipping');
      return jsonOk({ skipped: true, reason: 'gmail credentials missing' });
    }

    const { data: orderRow, error: fetchErr } = await supabase
      .from('orders')
      .select(`
        id, shipping_address, tracking_number,
        shipping_companies(company_name)
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (fetchErr || !orderRow) {
      console.error('[status-email] order fetch error:', fetchErr);
      return jsonOk({ error: 'لم نجد الطلب' });
    }

    const ship = (orderRow.shipping_address ?? {}) as Record<string, string>;
    const customerEmail = ship.email ?? '';
    const customerName  = ship.name  ?? 'عميل';

    if (!customerEmail) {
      return jsonOk({ skipped: true, reason: 'no customer email on this order' });
    }

    const companyName = (orderRow.shipping_companies as { company_name?: string } | null)?.company_name;

    try {
      await sendViaSmtp(
        customerEmail,
        COPY[kind].subject(orderRow.id),
        buildEmailHtml(kind, customerName, orderRow.id, orderRow.tracking_number ?? undefined, companyName),
      );
      return jsonOk({ sent: true, kind });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[status-email] send failed:', msg);
      return jsonOk({ sent: false, error: msg });
    }
  } catch (err) {
    console.error('[status-email] Unexpected:', err);
    return jsonOk({ error: err instanceof Error ? err.message : 'خطأ غير متوقع' });
  }
});
