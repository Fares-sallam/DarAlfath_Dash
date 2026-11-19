-- ══════════════════════════════════════════════════════════════════════════
-- فصل صلاحيات المحتوى عن «إدارة الكتب والمنتجات»
--
-- قبل: خمس صفحات (صور الصفحة الرئيسية، فيديوهات «من الدار»، الإعلانات والأشرطة،
--      الصفحة والروابط، مظهر المتجر) كانت كلها خلف can_manage_products.
-- بعد، ثلاث صلاحيات مستقلة:
--   • can_manage_home_media  = صور الصفحة الرئيسية + فيديوهات «من الدار»
--   • can_manage_appearance  = إدارة الإعلانات والأشرطة + مظهر المتجر
--   • can_manage_links_page  = إدارة الصفحة والروابط
--
-- الترحيل (مرة واحدة فقط، عند إنشاء العمود): كل مشرف كان يدخل هذه الصفحات يحتفظ بدخوله
-- (القيمة الابتدائية = can_manage_products). بعد ذلك تُضبط يدويًا من «إعدادات المشرفين».
-- الكتابة نفسها تمر عبر is_admin() كما كانت.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['can_manage_home_media', 'can_manage_appearance', 'can_manage_links_page']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'admin_settings' AND column_name = col
    ) THEN
      EXECUTE format('ALTER TABLE public.admin_settings ADD COLUMN %I boolean NOT NULL DEFAULT false', col);
      EXECUTE format('UPDATE public.admin_settings SET %I = can_manage_products', col);
    END IF;
  END LOOP;
END $$;
