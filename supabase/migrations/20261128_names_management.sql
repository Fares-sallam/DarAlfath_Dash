-- إدارة قايمتي المؤلفين والناشرين: أرقام الاستخدام، تغيير اسم (بيتغيّر على كل كتبه)، دمج اسمين، حذف اللي مش مستخدم،
-- وحارس في قاعدة البيانات بيرجّع أي اسم مكتوب بشكل تاني لشكله في القايمة، فمفيش طريقة (نموذج، استيراد، SQL) تعمل نسخة تانية.
-- إضافة بس: دوال وحارس؛ مفيش بيانات بتتغيّر لحد ما حد يستخدم الدوال.

-- (النوع: 'author' أو 'publisher' بس؛ الأسماء ثابتة جوه الدوال، مفيش حاجة من برا بتدخل في الاستعلام.)
CREATE OR REPLACE FUNCTION public._name_list_target(p_kind text, OUT tbl text, OUT col text, OUT keyfn text)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_kind = 'author' THEN
    tbl := 'authors'; col := 'author'; keyfn := 'public.author_key';
  ELSIF p_kind = 'publisher' THEN
    tbl := 'publishers'; col := 'publisher'; keyfn := 'public.publisher_key';
  ELSE
    RAISE EXCEPTION 'unknown name list: %', p_kind USING ERRCODE = '22023';
  END IF;
END;
$$;

-- كل اسم في القايمة وعدد كتبه، وبعده الأسماء المكتوبة على كتب ومش في القايمة (id فاضي)
CREATE OR REPLACE FUNCTION public.name_list_usage(p_kind text)
RETURNS TABLE (id uuid, name text, books bigint, listed boolean)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public._name_list_target(p_kind);
  RETURN QUERY EXECUTE format($q$
    WITH used AS (
      SELECT %2$I AS raw, %3$s(%2$I) AS k, count(*) AS n
      FROM public.products WHERE %2$I IS NOT NULL AND btrim(%2$I) <> '' GROUP BY 1, 2
    ),
    listed AS (SELECT l.id, l.name, %3$s(l.name) AS k FROM public.%1$I l)
    SELECT l.id, l.name, coalesce((SELECT sum(u.n) FROM used u WHERE u.k = l.k), 0)::bigint, true FROM listed l
    UNION ALL
    SELECT NULL::uuid, (array_agg(u.raw ORDER BY u.n DESC, u.raw))[1], sum(u.n)::bigint, false
    FROM used u WHERE NOT EXISTS (SELECT 1 FROM listed l WHERE l.k = u.k) GROUP BY u.k
  $q$, t.tbl, t.col, t.keyfn);
END;
$$;

-- تغيير اسم: القايمة وكل كتبه (بأي شكل كان مكتوب) في عملية واحدة؛ بيرجّع عدد الكتب اللي اتغيّرت
CREATE OR REPLACE FUNCTION public.name_list_rename(p_kind text, p_id uuid, p_name text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE t record; v_old text; v_new text; v_changed integer;
BEGIN
  SELECT * INTO t FROM public._name_list_target(p_kind);
  v_new := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  IF v_new = '' THEN RAISE EXCEPTION 'empty name' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT name FROM public.%I WHERE id = $1', t.tbl) INTO v_old USING p_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'name not found' USING ERRCODE = 'P0002'; END IF;
  -- الاسم الجديد لو بنفس مفتاح اسم تاني في القايمة، المفتاح الفريد بيرفض (unique violation)
  EXECUTE format('UPDATE public.%I SET name = $1 WHERE id = $2', t.tbl) USING v_new, p_id;
  EXECUTE format('UPDATE public.products SET %1$I = $1 WHERE %2$s(%1$I) = %2$s($2) AND %1$I IS DISTINCT FROM $1', t.col, t.keyfn) USING v_new, v_old;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed;
END;
$$;

-- دمج: كتب الاسم الأول تتنقل للتاني والأول يتشال من القايمة؛ بيرجّع عدد الكتب اللي اتنقلت
CREATE OR REPLACE FUNCTION public.name_list_merge(p_kind text, p_from uuid, p_into uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE t record; v_from text; v_into text; v_changed integer;
BEGIN
  SELECT * INTO t FROM public._name_list_target(p_kind);
  IF p_from = p_into THEN RAISE EXCEPTION 'cannot merge a name into itself' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT name FROM public.%I WHERE id = $1', t.tbl) INTO v_from USING p_from;
  EXECUTE format('SELECT name FROM public.%I WHERE id = $1', t.tbl) INTO v_into USING p_into;
  IF v_from IS NULL OR v_into IS NULL THEN RAISE EXCEPTION 'name not found' USING ERRCODE = 'P0002'; END IF;
  EXECUTE format('UPDATE public.products SET %1$I = $1 WHERE %2$s(%1$I) = %2$s($2) AND %1$I IS DISTINCT FROM $1', t.col, t.keyfn) USING v_into, v_from;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', t.tbl) USING p_from;
  RETURN v_changed;
END;
$$;

-- حذف اسم من القايمة: بس لو مفيش كتاب عليه
CREATE OR REPLACE FUNCTION public.name_list_delete(p_kind text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE t record; v_name text; v_books bigint;
BEGIN
  SELECT * INTO t FROM public._name_list_target(p_kind);
  EXECUTE format('SELECT name FROM public.%I WHERE id = $1', t.tbl) INTO v_name USING p_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'name not found' USING ERRCODE = 'P0002'; END IF;
  EXECUTE format('SELECT count(*) FROM public.products WHERE %1$s(%2$I) = %1$s($1)', t.keyfn, t.col) INTO v_books USING v_name;
  IF v_books > 0 THEN RAISE EXCEPTION 'name still used by % books', v_books USING ERRCODE = '23503'; END IF;
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', t.tbl) USING p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.name_list_usage(text), public.name_list_rename(text, uuid, text),
  public.name_list_merge(text, uuid, uuid), public.name_list_delete(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.name_list_usage(text), public.name_list_rename(text, uuid, text),
  public.name_list_merge(text, uuid, uuid), public.name_list_delete(text, uuid) TO authenticated;

-- الحارس: أي كتاب بيتكتب (أو بيتعدّل) مؤلفه أو ناشره بشكل تاني لاسم في القايمة، بيتحفظ بشكل القايمة
CREATE OR REPLACE FUNCTION public.products_snap_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v text;
BEGIN
  IF NEW.author IS NOT NULL AND btrim(NEW.author) <> '' THEN
    SELECT a.name INTO v FROM public.authors a WHERE public.author_key(a.name) = public.author_key(NEW.author) LIMIT 1;
    IF v IS NOT NULL THEN NEW.author := v; END IF;
  END IF;
  IF NEW.publisher IS NOT NULL AND btrim(NEW.publisher) <> '' THEN
    SELECT p.name INTO v FROM public.publishers p WHERE public.publisher_key(p.name) = public.publisher_key(NEW.publisher) LIMIT 1;
    IF v IS NOT NULL THEN NEW.publisher := v; END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.products_snap_names() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_products_snap_names ON public.products;
CREATE TRIGGER trg_products_snap_names
  BEFORE INSERT OR UPDATE OF author, publisher ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_snap_names();

-- نظافة: مسار البحث ثابت على كل دوال القوايم (الدالتين اللي في migration المؤلفين والناشرين كمان)
ALTER FUNCTION public.publisher_key(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.author_key(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.publishers_clean_name() SET search_path = public, pg_temp;
ALTER FUNCTION public.authors_clean_name() SET search_path = public, pg_temp;
ALTER FUNCTION public._name_list_target(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.name_list_usage(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.name_list_rename(text, uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.name_list_merge(text, uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.name_list_delete(text, uuid) SET search_path = public, pg_temp;
