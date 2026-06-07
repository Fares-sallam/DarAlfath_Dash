import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const OWNER_EMAIL = 'faresalsaid780@gmail.com';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse(
        {
          error: 'إعدادات Supabase غير مكتملة داخل Edge Function',
          details: {
            hasUrl: !!supabaseUrl,
            hasAnon: !!supabaseAnonKey,
            hasServiceRole: !!supabaseServiceRoleKey,
          },
        },
        500
      );
    }

    /* ── Verify caller ── */
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return jsonResponse({ error: 'غير مصرح: لا يوجد رمز مصادقة' }, 401);
    }

    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

    const {
      data: { user: caller },
      error: callerError,
    } = await supabaseAnon.auth.getUser(token);

    if (callerError || !caller) {
      return jsonResponse(
        {
          error: 'غير مصرح: رمز المصادقة غير صالح',
          details: callerError?.message || null,
        },
        401
      );
    }

    if (caller.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
      return jsonResponse(
        { error: 'غير مصرح: هذه العملية متاحة لمالك النظام فقط' },
        403
      );
    }

    /* ── Parse body ── */
    const body = await req.json();

    const {
      email,
      password,
      full_name,
      phone,
      role,
      permissions,
      country_ids,
      primary_country_id,
    } = body as {
      email: string;
      password: string;
      full_name: string;
      phone?: string;
      role: string;
      permissions?: Record<string, boolean>;
      country_ids?: string[];
      primary_country_id?: string | null;
    };

    if (!email || !password || !full_name || !role) {
      return jsonResponse(
        { error: 'البيانات المطلوبة ناقصة: email, password, full_name, role' },
        400
      );
    }

    if (password.length < 8) {
      return jsonResponse(
        { error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
        400
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedFullName = full_name.trim();
    const trimmedPhone = phone?.trim() || null;

    const uniqueCountryIds = Array.from(
      new Set((country_ids ?? []).filter((id) => typeof id === 'string' && id.trim()))
    );

    if (uniqueCountryIds.length === 0) {
      return jsonResponse(
        { error: 'يجب اختيار دولة واحدة على الأقل للمشرف' },
        400
      );
    }

    const resolvedPrimaryCountryId =
      primary_country_id && uniqueCountryIds.includes(primary_country_id)
        ? primary_country_id
        : uniqueCountryIds[0];

    if (!resolvedPrimaryCountryId) {
      return jsonResponse(
        { error: 'يجب تحديد دولة أساسية صحيحة للمشرف' },
        400
      );
    }

    /* ── Admin client ── */
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    /* ── Step 1: Create Auth user ── */
    const { data: newUserData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: trimmedFullName,
          has_password: true,
        },
      });

    if (createError) {
      return jsonResponse(
        { error: `فشل إنشاء المستخدم: ${createError.message}` },
        400
      );
    }

    const newUser = newUserData.user;

    if (!newUser) {
      return jsonResponse(
        { error: 'فشل إنشاء المستخدم: لم يتم إرجاع بيانات المستخدم' },
        500
      );
    }

    /* ── Step 2: Upsert profile ── */
    const profilePayload: Record<string, unknown> = {
      id: newUser.id,
      full_name: trimmedFullName,
      role,
      is_active: true,
    };

    if (trimmedPhone) {
      profilePayload.phone = trimmedPhone;
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' });

    if (profileError) {
      const { error: fallbackProfileError } = await supabaseAdmin
        .from('profiles')
        .update({
          full_name: trimmedFullName,
          role,
          phone: trimmedPhone,
          is_active: true,
        })
        .eq('id', newUser.id);

      if (fallbackProfileError) {
        return jsonResponse(
          {
            error: 'تم إنشاء المستخدم لكن فشل حفظ الملف الشخصي',
            details: fallbackProfileError.message,
            user_id: newUser.id,
          },
          500
        );
      }
    }

    /* ── Step 3: Upsert admin_settings ── */
    const adminPayload = {
      user_id: newUser.id,
      country_id: resolvedPrimaryCountryId,
      can_manage_products: permissions?.can_manage_products ?? false,
      can_manage_orders: permissions?.can_manage_orders ?? false,
      can_manage_users: permissions?.can_manage_users ?? false,
      can_manage_admins: permissions?.can_manage_admins ?? false,
      can_manage_inventory: permissions?.can_manage_inventory ?? false,
      can_manage_coupons: permissions?.can_manage_coupons ?? false,
      can_manage_shipping: permissions?.can_manage_shipping ?? false,
      can_view_analytics: permissions?.can_view_analytics ?? false,
      can_export: permissions?.can_export ?? false,
      can_view_activity_log: permissions?.can_view_activity_log ?? false,
    };

    const { error: settingsError } = await supabaseAdmin
      .from('admin_settings')
      .upsert(adminPayload, { onConflict: 'user_id' });

    if (settingsError) {
      return jsonResponse(
        {
          error: 'تم إنشاء المستخدم والملف الشخصي لكن فشل حفظ صلاحيات المشرف',
          details: settingsError.message,
          user_id: newUser.id,
        },
        500
      );
    }

    /* ── Step 4: Save multi-country access ── */
    const { error: deleteAccessError } = await supabaseAdmin
      .from('admin_country_access')
      .delete()
      .eq('user_id', newUser.id);

    if (deleteAccessError) {
      return jsonResponse(
        {
          error: 'تم إنشاء المستخدم لكن فشل تهيئة الدول المسموح بها',
          details: deleteAccessError.message,
          user_id: newUser.id,
        },
        500
      );
    }

    const accessRows = uniqueCountryIds.map((countryId) => ({
      user_id: newUser.id,
      country_id: countryId,
      is_primary: countryId === resolvedPrimaryCountryId,
    }));

    const { error: accessInsertError } = await supabaseAdmin
      .from('admin_country_access')
      .insert(accessRows);

    if (accessInsertError) {
      return jsonResponse(
        {
          error: 'تم إنشاء المستخدم لكن فشل حفظ الدول المسموح بها',
          details: accessInsertError.message,
          user_id: newUser.id,
        },
        500
      );
    }

    return jsonResponse(
      {
        success: true,
        user_id: newUser.id,
        email: newUser.email,
        country_ids: uniqueCountryIds,
        primary_country_id: resolvedPrimaryCountryId,
        message: `تم إنشاء حساب المشرف بنجاح: ${trimmedFullName}`,
      },
      200
    );
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? `خطأ غير متوقع: ${error.message}`
            : 'خطأ غير متوقع في الخادم',
      },
      500
    );
  }
});