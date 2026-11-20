-- إعادة ترتيب إخوة (عناصر تحت نفس الأب): الترتيب الجديد ياخد "نفس الأماكن" القديمة للإخوة بترتيب تصاعدي.
-- مهم لأن القوائم المسطحة (كروت السلاسل في الرئيسية، شريط التصنيفات) مرتبة بالقيمة نفسها على مستوى كل السلاسل
-- وكل التصنيفات: لو رقّمنا كل مجموعة إخوة من 0 كان ترتيب الشريط هيتلخبط. لو القيم متكررة نرقّم تتابعيًا من أقل قيمة.
CREATE OR REPLACE FUNCTION public.catalog_reorder_nodes(p_ids uuid[], p_channel text DEFAULT 'both')
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer := COALESCE(array_length(p_ids, 1), 0);
  v_web integer[];
  v_app integer[];
BEGIN
  IF p_channel NOT IN ('web', 'app', 'both') THEN
    RAISE EXCEPTION 'unknown channel %', p_channel;
  END IF;
  IF v_n = 0 THEN
    RETURN;
  END IF;

  SELECT array_agg(sort_web ORDER BY sort_web), array_agg(sort_app ORDER BY sort_app)
  INTO v_web, v_app
  FROM public.catalog_nodes WHERE id = ANY (p_ids);

  IF COALESCE(array_length(v_web, 1), 0) <> v_n THEN
    RAISE EXCEPTION 'some of the nodes to reorder were not found';
  END IF;

  IF (SELECT count(DISTINCT x) FROM unnest(v_web) x) <> v_n THEN
    SELECT array_agg(g ORDER BY g) INTO v_web FROM generate_series(v_web[1], v_web[1] + v_n - 1) g;
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(v_app) x) <> v_n THEN
    SELECT array_agg(g ORDER BY g) INTO v_app FROM generate_series(v_app[1], v_app[1] + v_n - 1) g;
  END IF;

  UPDATE public.catalog_nodes n
  SET sort_web = CASE WHEN p_channel IN ('web', 'both') THEN v_web[o.pos] ELSE n.sort_web END,
      sort_app = CASE WHEN p_channel IN ('app', 'both') THEN v_app[o.pos] ELSE n.sort_app END
  FROM unnest(p_ids) WITH ORDINALITY AS o(id, pos)
  WHERE n.id = o.id;
END;
$$;
