-- الصفحة الرئيسية للتطبيق من لوحة «الصفحة الرئيسية»: النسخ المنشورة من التطبيق لسه بتقرا app_home_settings (٤ مفاتيح إظهار
-- وعنوان أقسام المتجر)، فأي تعديل على صفوف home_layout (قناة app) بيتنقل لها تلقائيًا؛ والنسخة الجاية بتقرا home_layout نفسه.
-- إضافة بس: دالة وحارس؛ مفيش بيانات بتتغيّر لحد ما حد يعدّل صف في home_layout للتطبيق.
CREATE OR REPLACE FUNCTION public.home_layout_mirror_app_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.channel <> 'app' THEN
    RETURN NEW;
  END IF;
  IF NEW.section_key = 'departments' THEN
    UPDATE public.app_home_settings SET show_store_departments = NEW.visible, store_departments_title = NULLIF(btrim(coalesce(NEW.title_ar, '')), '') WHERE id = 1;
  ELSIF NEW.section_key = 'new-arrivals' THEN
    UPDATE public.app_home_settings SET show_new_arrivals = NEW.visible WHERE id = 1;
  ELSIF NEW.section_key = 'offers' THEN
    UPDATE public.app_home_settings SET show_offers = NEW.visible WHERE id = 1;
  ELSIF NEW.section_key = 'ebook-library' THEN
    UPDATE public.app_home_settings SET show_ebook_library = NEW.visible WHERE id = 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.home_layout_mirror_app_settings() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_home_layout_mirror_app_settings ON public.home_layout;
CREATE TRIGGER trg_home_layout_mirror_app_settings
  AFTER INSERT OR UPDATE OF visible, title_ar ON public.home_layout
  FOR EACH ROW
  WHEN (NEW.channel = 'app')
  EXECUTE FUNCTION public.home_layout_mirror_app_settings();
