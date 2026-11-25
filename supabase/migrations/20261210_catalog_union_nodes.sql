-- «دمج بدون حذف»: combine two items into a NEW one (for example a category «التربوي والحساب» holding the books of «التربوي» and of
-- «الحساب») while both originals stay exactly as they are. The new item links to every book of the two (as an extra place, so no
-- book's primary category changes), and can be taken back with one call that removes only the new item.
-- Additive only: one table, two functions, and the history function now also lists these.

-- which items were made by combining (the originals are plain ids on purpose: they may be merged or deleted later)
CREATE TABLE IF NOT EXISTS public.catalog_unions (
  node_id      uuid PRIMARY KEY REFERENCES public.catalog_nodes(id) ON DELETE CASCADE,
  source_a     uuid,
  source_b     uuid,
  source_names text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.catalog_unions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_unions FROM anon, authenticated;

-- ── make the new item ──
CREATE OR REPLACE FUNCTION public.catalog_union_nodes(p_a uuid, p_b uuid, p_name text, p_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.catalog_nodes%ROWTYPE;
  b public.catalog_nodes%ROWTYPE;
  rec record;
  v_name text := btrim(COALESCE(p_name, ''));
  v_base text;
  v_slug text;
  v_try integer := 1;
  v_type text;
  v_parent uuid;
  v_sort_web integer;
  v_sort_app integer;
  v_id uuid;
  v_next integer := 0;
  v_books integer := 0;
BEGIN
  IF NOT public.has_catalog_permission() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_a IS NULL OR p_b IS NULL OR p_a = p_b THEN
    RAISE EXCEPTION 'merge needs two different items';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'a name is needed';
  END IF;

  SELECT * INTO a FROM public.catalog_nodes WHERE id = p_a;
  IF NOT FOUND THEN RAISE EXCEPTION 'the item to merge does not exist'; END IF;
  SELECT * INTO b FROM public.catalog_nodes WHERE id = p_b;
  IF NOT FOUND THEN RAISE EXCEPTION 'the item to merge into does not exist'; END IF;

  IF (CASE WHEN a.type IN ('category', 'collection') THEN 'category' ELSE a.type END)
     IS DISTINCT FROM (CASE WHEN b.type IN ('category', 'collection') THEN 'category' ELSE b.type END) THEN
    RAISE EXCEPTION 'can only merge items of the same kind';
  END IF;
  IF a.type = 'section' THEN
    RAISE EXCEPTION 'sections cannot be combined without deleting one';
  END IF;

  v_type := CASE
    WHEN a.type = 'series' THEN 'series'
    WHEN a.type = 'collection' AND b.type = 'collection' THEN 'collection'
    ELSE 'category'
  END;
  -- it sits where both sit when they share a parent, otherwise at the top
  v_parent := CASE WHEN a.parent_id IS NOT DISTINCT FROM b.parent_id THEN a.parent_id ELSE NULL END;

  v_base := COALESCE(NULLIF(btrim(COALESCE(p_slug, '')), ''), NULLIF(public.catalog_slugify(v_name), ''), 'item-' || left(gen_random_uuid()::text, 6));
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.catalog_nodes WHERE slug = v_slug) LOOP
    v_try := v_try + 1;
    v_slug := v_base || '-' || v_try;
  END LOOP;

  -- at the end of its kind, like any new item
  SELECT COALESCE(max(sort_web) + 1, 0), COALESCE(max(sort_app) + 1, 0) INTO v_sort_web, v_sort_app
  FROM public.catalog_nodes
  WHERE (CASE WHEN type = 'series' THEN 'series' WHEN type = 'section' THEN 'section' ELSE 'category' END)
      = (CASE WHEN v_type = 'series' THEN 'series' ELSE 'category' END);

  INSERT INTO public.catalog_nodes (type, name_ar, slug, parent_id, sort_web, sort_app)
  VALUES (v_type, v_name, v_slug, v_parent, v_sort_web, v_sort_app)
  RETURNING id INTO v_id;

  -- every book of the two, the first item's books first, each one once, as an extra place (never the primary)
  FOR rec IN
    SELECT pn.product_id
    FROM public.product_nodes pn
    WHERE pn.node_id IN (p_a, p_b)
    GROUP BY pn.product_id
    ORDER BY min(CASE WHEN pn.node_id = p_a THEN 0 ELSE 1 END), min(pn.sort_order), pn.product_id
  LOOP
    INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order)
    VALUES (rec.product_id, v_id, false, v_next)
    ON CONFLICT (product_id, node_id) DO NOTHING;
    v_next := v_next + 1;
    v_books := v_books + 1;
  END LOOP;

  INSERT INTO public.catalog_unions (node_id, source_a, source_b, source_names)
  VALUES (v_id, p_a, p_b, a.name_ar || ' + ' || b.name_ar);

  RETURN jsonb_build_object(
    'id', v_id, 'name', v_name, 'slug', v_slug, 'type', v_type, 'books', v_books,
    'source_a_name', a.name_ar, 'source_b_name', b.name_ar
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_union_nodes(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_union_nodes(uuid, uuid, text, text) TO authenticated;

-- ── take it back: removes the new item and its links, the originals are never touched ──
CREATE OR REPLACE FUNCTION public.catalog_remove_union(p_node uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n public.catalog_nodes%ROWTYPE;
  v_books integer;
BEGIN
  IF NOT public.has_catalog_permission() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog_unions WHERE node_id = p_node) THEN
    RAISE EXCEPTION 'this item was not made by combining two items';
  END IF;
  SELECT * INTO n FROM public.catalog_nodes WHERE id = p_node FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'the item does not exist any more'; END IF;
  IF EXISTS (SELECT 1 FROM public.product_nodes WHERE node_id = p_node AND is_primary) THEN
    RAISE EXCEPTION 'some books use this item as their primary category: change that first';
  END IF;

  DELETE FROM public.product_nodes WHERE node_id = p_node;
  GET DIAGNOSTICS v_books = ROW_COUNT;
  -- the usual guard refuses (in plain words) when something was put under it since
  DELETE FROM public.catalog_nodes WHERE id = p_node;

  RETURN jsonb_build_object('name', n.name_ar, 'books_removed', v_books);
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_remove_union(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_remove_union(uuid) TO authenticated;

-- ── the dashboard's list: merges and combined items together ──
DROP FUNCTION IF EXISTS public.catalog_merge_history(integer);
CREATE FUNCTION public.catalog_merge_history(p_limit integer DEFAULT 20)
RETURNS TABLE (kind text, old_id uuid, source_name text, target_id uuid, target_name text, merged_at timestamptz, summary jsonb, can_undo boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_catalog_permission() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT * FROM (
    SELECT 'merge'::text AS kind, a.old_id, a.source_name, a.node_id AS target_id, n.name_ar AS target_name, a.merged_at, a.summary,
           (a.moved IS NOT NULL AND a.node_id = (a.moved ->> 'target_id')::uuid) AS can_undo
    FROM public.catalog_node_aliases a
    JOIN public.catalog_nodes n ON n.id = a.node_id
    WHERE a.moved IS NOT NULL
    UNION ALL
    -- a combined item: «old_id» is the new item's own id (that is what the undo takes)
    SELECT 'union'::text, u.node_id, u.source_names, u.node_id, n.name_ar, u.created_at,
           jsonb_build_object('books', (SELECT count(*) FROM public.product_nodes pn WHERE pn.node_id = u.node_id)),
           NOT EXISTS (SELECT 1 FROM public.product_nodes pn WHERE pn.node_id = u.node_id AND pn.is_primary)
    FROM public.catalog_unions u
    JOIN public.catalog_nodes n ON n.id = u.node_id
  ) x
  ORDER BY x.merged_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_merge_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_merge_history(integer) TO authenticated;
