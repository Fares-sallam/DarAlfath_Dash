-- Merge two catalog items into one («دمج»): every book of the first moves to the second, what sits under the first moves under the
-- second, the places that point at the first (header links, home shelves, «أقسام المتجر») point at the second, and the first is
-- deleted. Its old address keeps working: an alias row sends it to the second one.
-- Additive only: one new table and one new function. Nothing existing is changed until someone merges two items.

-- ── 1) where a merged item's old address goes ──
CREATE TABLE IF NOT EXISTS public.catalog_node_aliases (
  old_id      uuid PRIMARY KEY,
  old_slug    text,
  node_id     uuid NOT NULL REFERENCES public.catalog_nodes(id) ON DELETE CASCADE,
  source_name text,
  merged_at   timestamptz NOT NULL DEFAULT now(),
  -- the whole row as it was, so a merge can be undone by hand if it was a mistake
  snapshot    jsonb
);

CREATE INDEX IF NOT EXISTS catalog_node_aliases_node_idx ON public.catalog_node_aliases (node_id);
CREATE INDEX IF NOT EXISTS catalog_node_aliases_slug_idx ON public.catalog_node_aliases (old_slug);

ALTER TABLE public.catalog_node_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_node_aliases_public_read ON public.catalog_node_aliases;
CREATE POLICY catalog_node_aliases_public_read ON public.catalog_node_aliases FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS catalog_node_aliases_admin_all ON public.catalog_node_aliases;
CREATE POLICY catalog_node_aliases_admin_all ON public.catalog_node_aliases
  FOR ALL TO authenticated USING (public.has_catalog_permission()) WITH CHECK (public.has_catalog_permission());

-- ── 2) the merge, in one transaction ──
-- p_source disappears into p_target. Both must be the same kind (a category or a collection with one of those, a series with a
-- series, a section with a section) and the target must not sit inside the source. p_new_name renames the surviving item.
CREATE OR REPLACE FUNCTION public.catalog_merge_nodes(p_source uuid, p_target uuid, p_new_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.catalog_nodes%ROWTYPE;
  t public.catalog_nodes%ROWTYPE;
  rec record;
  v_next integer;
  v_moved integer := 0;
  v_already integer := 0;
  v_children integer := 0;
  v_menu integer := 0;
  v_layout integer := 0;
  v_dept integer := 0;
  v_name text := NULLIF(btrim(COALESCE(p_new_name, '')), '');
BEGIN
  IF NOT public.has_catalog_permission() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_source IS NULL OR p_target IS NULL OR p_source = p_target THEN
    RAISE EXCEPTION 'merge needs two different items';
  END IF;

  SELECT * INTO s FROM public.catalog_nodes WHERE id = p_source FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'the item to merge does not exist'; END IF;
  SELECT * INTO t FROM public.catalog_nodes WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'the item to merge into does not exist'; END IF;

  IF (CASE WHEN s.type IN ('category', 'collection') THEN 'category' ELSE s.type END)
     IS DISTINCT FROM (CASE WHEN t.type IN ('category', 'collection') THEN 'category' ELSE t.type END) THEN
    RAISE EXCEPTION 'can only merge items of the same kind';
  END IF;

  -- the target may not be somewhere under the source: the source's children would end up under themselves
  IF EXISTS (
    WITH RECURSIVE up AS (
      SELECT id, parent_id FROM public.catalog_nodes WHERE id = p_target
      UNION ALL
      SELECT n.id, n.parent_id FROM public.catalog_nodes n JOIN up ON n.id = up.parent_id
    )
    SELECT 1 FROM up WHERE id = p_source
  ) THEN
    RAISE EXCEPTION 'cannot merge into an item inside itself';
  END IF;

  -- books in both: one link on the target stays; it becomes the primary one when the source was the book's primary
  FOR rec IN
    SELECT sp.product_id, sp.is_primary
    FROM public.product_nodes sp
    JOIN public.product_nodes tp ON tp.product_id = sp.product_id AND tp.node_id = p_target
    WHERE sp.node_id = p_source
  LOOP
    DELETE FROM public.product_nodes WHERE product_id = rec.product_id AND node_id = p_source;
    IF rec.is_primary THEN
      UPDATE public.product_nodes SET is_primary = true WHERE product_id = rec.product_id AND node_id = p_target;
    END IF;
    v_already := v_already + 1;
  END LOOP;

  -- the rest of the source's books move over, keeping their order at the end of the target's books and their primary flag
  SELECT COALESCE(max(sort_order), -1) INTO v_next FROM public.product_nodes WHERE node_id = p_target;
  FOR rec IN
    SELECT product_id FROM public.product_nodes WHERE node_id = p_source ORDER BY sort_order, product_id
  LOOP
    v_next := v_next + 1;
    UPDATE public.product_nodes SET node_id = p_target, sort_order = v_next WHERE product_id = rec.product_id AND node_id = p_source;
    v_moved := v_moved + 1;
  END LOOP;

  -- what sits under the source goes under the target
  UPDATE public.catalog_nodes SET parent_id = p_target WHERE parent_id = p_source;
  GET DIAGNOSTICS v_children = ROW_COUNT;

  -- the header's links: an entry that would appear twice under the same parent is dropped (when nothing hangs under it)
  DELETE FROM public.menu_items m
  WHERE m.node_id = p_source
    AND EXISTS (SELECT 1 FROM public.menu_items x WHERE x.node_id = p_target AND x.channel = m.channel AND x.parent_id IS NOT DISTINCT FROM m.parent_id)
    AND NOT EXISTS (SELECT 1 FROM public.menu_items c WHERE c.parent_id = m.id);
  UPDATE public.menu_items SET node_id = p_target WHERE node_id = p_source;
  GET DIAGNOSTICS v_menu = ROW_COUNT;

  UPDATE public.home_layout SET node_id = p_target WHERE node_id = p_source;
  GET DIAGNOSTICS v_layout = ROW_COUNT;

  -- «أقسام المتجر»: the card of the source becomes the target's, or just goes when the target already has one
  IF EXISTS (SELECT 1 FROM public.store_departments WHERE node_id = p_source) THEN
    v_dept := 1;
    IF EXISTS (SELECT 1 FROM public.store_departments WHERE node_id = p_target) THEN
      DELETE FROM public.store_departments WHERE node_id = p_source;
    ELSE
      UPDATE public.store_departments SET node_id = p_target WHERE node_id = p_source;
    END IF;
  END IF;

  -- the old address (and every address an earlier merge already sent here) keeps working
  UPDATE public.catalog_node_aliases SET node_id = p_target WHERE node_id = p_source;
  INSERT INTO public.catalog_node_aliases (old_id, old_slug, node_id, source_name, snapshot)
  VALUES (s.id, s.slug, p_target, s.name_ar, to_jsonb(s))
  ON CONFLICT (old_id) DO UPDATE SET node_id = EXCLUDED.node_id, old_slug = EXCLUDED.old_slug, source_name = EXCLUDED.source_name, snapshot = EXCLUDED.snapshot, merged_at = now();

  DELETE FROM public.catalog_nodes WHERE id = p_source;

  -- renamed last: the source's name is free only once it is gone
  IF v_name IS NOT NULL AND v_name IS DISTINCT FROM t.name_ar THEN
    UPDATE public.catalog_nodes SET name_ar = v_name WHERE id = p_target;
  END IF;

  RETURN jsonb_build_object(
    'source_name', s.name_ar,
    'target_name', COALESCE(v_name, t.name_ar),
    'books_moved', v_moved,
    'books_already_in_target', v_already,
    'children_moved', v_children,
    'menu_items', v_menu,
    'home_blocks', v_layout,
    'departments', v_dept
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_merge_nodes(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_merge_nodes(uuid, uuid, text) TO authenticated;
