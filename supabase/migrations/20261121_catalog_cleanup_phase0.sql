-- ══════════════════════════════════════════════════════════════════════════
-- المرحلة 0 من تنظيم التصنيفات والسلاسل (إصلاحات صغيرة، لا تغيّر شكل أي جدول)
--
-- 1) مسافات زيادة في آخر 7 أسماء تصنيفات ← تُنظَّف، ومعها trigger ينظّف أي اسم جديد.
-- 2) حذف التصنيف التجريبي «Ppp» (فاضي تمامًا: لا كتب ولا ربط ولا صف في الشريط).
-- 3) product_series.sort_order كان 0 لكل الكتب تقريبًا (والتبديل بين رقمين متساويين لا يحرّك شيئًا)
--    ← يُرقَّم 0…n-1 داخل كل سلسلة: الرقم الحالي أولًا ثم تاريخ إضافة الكتاب.
-- 4) سلاسل غير مفعّلة كانت مقروءة للجميع (سياستان بـ OR): نُبقي سياسة المجهول (is_active)
--    ونجعل قراءة المسجّلين مفعّلة أو للمشرفين فقط.
-- 5) trigger التدقيق مكرر على categories و book_series (audit_* و trg_audit_*): نُبقي الأحدث (فيه البريد).
--
-- نسخة احتياطية قبل التنفيذ: schema backups.p0_20261121_* (خاص، لا يصله أحد من الواجهات).
-- ══════════════════════════════════════════════════════════════════════════

-- 1) أسماء بلا مسافات زيادة
UPDATE public.categories SET name = btrim(name) WHERE name <> btrim(name);

CREATE OR REPLACE FUNCTION public.trim_taxonomy_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.name IS NOT NULL THEN
    NEW.name := btrim(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trim_name ON public.categories;
CREATE TRIGGER trg_trim_name
  BEFORE INSERT OR UPDATE OF name ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.trim_taxonomy_name();

DROP TRIGGER IF EXISTS trg_trim_name ON public.book_series;
CREATE TRIGGER trg_trim_name
  BEFORE INSERT OR UPDATE OF name ON public.book_series
  FOR EACH ROW EXECUTE FUNCTION public.trim_taxonomy_name();

-- 2) التصنيف التجريبي (لا يُحذف إلا لو لسه فاضي)
DELETE FROM public.categories c
WHERE c.name = 'Ppp'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.product_categories pc WHERE pc.category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.category_bar_items b WHERE b.category_id = c.id);

-- 3) ترتيب الكتب داخل كل سلسلة
WITH ranked AS (
  SELECT ps.product_id,
         ps.series_id,
         row_number() OVER (
           PARTITION BY ps.series_id
           ORDER BY ps.sort_order, p.created_at, p.title, ps.product_id
         ) - 1 AS rn
  FROM public.product_series ps
  JOIN public.products p ON p.id = ps.product_id
)
UPDATE public.product_series ps
SET sort_order = r.rn
FROM ranked r
WHERE ps.product_id = r.product_id
  AND ps.series_id = r.series_id
  AND ps.sort_order <> r.rn;

-- 4) السلاسل غير المفعّلة لا تظهر للزوار ولا للعملاء
DROP POLICY IF EXISTS public_read_book_series ON public.book_series;
DROP POLICY IF EXISTS series_auth_select ON public.book_series;
CREATE POLICY series_auth_select ON public.book_series
  FOR SELECT TO authenticated
  USING (is_active = true OR public.is_admin());

-- 5) تسجيل تدقيق واحد بدل اتنين
DROP TRIGGER IF EXISTS audit_categories ON public.categories;
DROP TRIGGER IF EXISTS audit_book_series ON public.book_series;

-- تحقق: لو فشل أي شرط تتلغي العملية كلها
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.categories WHERE name <> btrim(name)) THEN
    RAISE EXCEPTION 'category names still have extra spaces';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_series
    GROUP BY series_id
    HAVING count(*) <> count(DISTINCT sort_order)
  ) THEN
    RAISE EXCEPTION 'product_series.sort_order is not unique inside a series';
  END IF;
END $$;
