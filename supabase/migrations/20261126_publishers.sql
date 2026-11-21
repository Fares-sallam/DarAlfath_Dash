-- قايمة الناشرين: اسم دار النشر يتختار من قايمة واحدة بدل ما يتكتب بأكتر من شكل.
-- إضافة بس: جدول جديد فاضي ودالة مفتاح؛ مفيش أي جدول موجود بيتغيّر (products.publisher يفضل نص زي ما هو).

-- مفتاح الاسم: بدون تشكيل ولا تطويل، الهمزات واحدة، الياء والألف المقصورة واحدة، التاء المربوطة والهاء واحدة،
-- المسافات المتكررة واحدة، حروف لاتينية صغيرة. "دار  الفتح" و"دَار الفتح" نفس الاسم.
CREATE OR REPLACE FUNCTION public.publisher_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(
    regexp_replace(
      translate(
        regexp_replace(lower(coalesce(p_name, '')), U&'[\064B-\065F\0670\0640]', '', 'g'),
        'أإآٱىة',
        'اااايه'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

CREATE TABLE IF NOT EXISTS public.publishers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publishers_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 160)
);

-- الاسم بيتخزّن منضّف (مسافات زيادة)، ومينفعش اسمين لهم نفس المفتاح
CREATE OR REPLACE FUNCTION public.publishers_clean_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := btrim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_publishers_clean_name ON public.publishers;
CREATE TRIGGER trg_publishers_clean_name
  BEFORE INSERT OR UPDATE OF name ON public.publishers
  FOR EACH ROW EXECUTE FUNCTION public.publishers_clean_name();

CREATE UNIQUE INDEX IF NOT EXISTS publishers_key_unique ON public.publishers (public.publisher_key(name));

ALTER TABLE public.publishers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS publishers_admin_all ON public.publishers;
CREATE POLICY publishers_admin_all ON public.publishers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
REVOKE ALL ON public.publishers FROM anon;

-- أي ناشر مكتوب على كتب موجودة يدخل القايمة (النهارده مفيش كتاب عليه ناشر، فمفيش حاجة بتتضاف)
INSERT INTO public.publishers (name)
SELECT DISTINCT ON (public.publisher_key(publisher)) btrim(regexp_replace(publisher, '\s+', ' ', 'g'))
FROM public.products
WHERE publisher IS NOT NULL AND btrim(publisher) <> ''
ORDER BY public.publisher_key(publisher), btrim(publisher)
ON CONFLICT DO NOTHING;
