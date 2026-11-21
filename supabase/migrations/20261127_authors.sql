-- قايمة المؤلفين: اسم المؤلف يتختار من قايمة واحدة بدل ما يتكتب بأكتر من شكل («عبدالغني» و«عبدالغنى»).
-- إضافة بس: جدول جديد ودالة مفتاح؛ مفيش أي جدول موجود بيتغيّر (products.author يفضل نص زي ما هو).

-- مفتاح اسم المؤلف: نفس مفتاح الناشر (بدون تشكيل، الهمزات والياء والتاء المربوطة واحدة، المسافات واحدة)
-- ومعاه اللقب في الأول مش بيفرّق: «د / أيمن أمين» و«أيمن أمين» نفس المؤلف.
CREATE OR REPLACE FUNCTION public.author_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(
    regexp_replace(
      public.publisher_key(p_name),
      '^(د|dr|prof|ا|دكتور|دكتوره|استاذ|استاذه)(\s*[./]\s*|\s+)',
      ''
    )
  );
$$;

CREATE TABLE IF NOT EXISTS public.authors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authors_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 160)
);

CREATE OR REPLACE FUNCTION public.authors_clean_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := btrim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_authors_clean_name ON public.authors;
CREATE TRIGGER trg_authors_clean_name
  BEFORE INSERT OR UPDATE OF name ON public.authors
  FOR EACH ROW EXECUTE FUNCTION public.authors_clean_name();

CREATE UNIQUE INDEX IF NOT EXISTS authors_key_unique ON public.authors (public.author_key(name));

ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authors_admin_all ON public.authors;
CREATE POLICY authors_admin_all ON public.authors
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
REVOKE ALL ON public.authors FROM anon;

-- المؤلفين المكتوبين على الكتب النهارده يدخلوا القايمة: اسم واحد لكل مؤلف، بالشكل الأكتر استخدامًا
-- (الكتب نفسها مبتتغيّرش، حتى اللي مكتوب فيها الاسم بشكل تاني).
INSERT INTO public.authors (name)
SELECT DISTINCT ON (public.author_key(author)) btrim(regexp_replace(author, '\s+', ' ', 'g'))
FROM (
  SELECT author, count(*) AS books
  FROM public.products
  WHERE author IS NOT NULL AND btrim(author) <> ''
  GROUP BY author
) used
ORDER BY public.author_key(author), books DESC, author
ON CONFLICT DO NOTHING;
