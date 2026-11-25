-- Undo for «دمج»: the merge now writes down everything it moved, and catalog_unmerge_node puts it all back (the deleted item with its
-- own id, its books with their primary flag and order, what was under it, the header links, home shelves, the «أقسام المتجر» card and
-- the addresses that pointed at it). Additive: two columns, one new function and a history function; the merge function is replaced
-- by a version that also records. No merge had been run when this was written, so nothing existing needs converting.

ALTER TABLE public.catalog_node_aliases
  ADD COLUMN IF NOT EXISTS moved   jsonb,  -- what the merge moved, enough to undo it
  ADD COLUMN IF NOT EXISTS summary jsonb;  -- what the merge reported

-- The row's inner data (the whole old item, the lists of moved books) is not for the public site: it only reads the address columns.
REVOKE ALL ON public.catalog_node_aliases FROM anon, authenticated;
GRANT SELECT (old_id, old_slug, node_id, source_name, merged_at) ON public.catalog_node_aliases TO anon, authenticated;

-- ── the merge, now recording ──
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
  v_sort integer;
  v_moved integer := 0;
  v_already integer := 0;
  v_children integer := 0;
  v_menu integer := 0;
  v_layout integer := 0;
  v_dept integer := 0;
  v_name text := NULLIF(btrim(COALESCE(p_new_name, '')), '');
  v_books jsonb := '[]'::jsonb;
  v_both jsonb := '[]'::jsonb;
  v_child_ids jsonb;
  v_menu_ids jsonb;
  v_menu_deleted jsonb;
  v_layout_ids jsonb;
  v_dept_info jsonb := NULL;
  v_alias_ids jsonb;
  v_summary jsonb;
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
    SELECT sp.product_id, sp.is_primary, sp.sort_order, sp.pinned, sp.created_at
    FROM public.product_nodes sp
    JOIN public.product_nodes tp ON tp.product_id = sp.product_id AND tp.node_id = p_target
    WHERE sp.node_id = p_source
  LOOP
    v_both := v_both || jsonb_build_object('product_id', rec.product_id, 'was_primary', rec.is_primary, 'sort_order', rec.sort_order, 'pinned', rec.pinned, 'created_at', rec.created_at);
    DELETE FROM public.product_nodes WHERE product_id = rec.product_id AND node_id = p_source;
    IF rec.is_primary THEN
      UPDATE public.product_nodes SET is_primary = true WHERE product_id = rec.product_id AND node_id = p_target;
    END IF;
    v_already := v_already + 1;
  END LOOP;

  -- the rest of the source's books move over, keeping their order at the end of the target's books and their primary flag
  SELECT COALESCE(max(sort_order), -1) INTO v_next FROM public.product_nodes WHERE node_id = p_target;
  FOR rec IN
    SELECT product_id, is_primary, sort_order FROM public.product_nodes WHERE node_id = p_source ORDER BY sort_order, product_id
  LOOP
    v_books := v_books || jsonb_build_object('product_id', rec.product_id, 'is_primary', rec.is_primary, 'sort_order', rec.sort_order);
    v_next := v_next + 1;
    UPDATE public.product_nodes SET node_id = p_target, sort_order = v_next WHERE product_id = rec.product_id AND node_id = p_source;
    v_moved := v_moved + 1;
  END LOOP;

  -- what sits under the source goes under the target
  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) INTO v_child_ids FROM public.catalog_nodes WHERE parent_id = p_source;
  UPDATE public.catalog_nodes SET parent_id = p_target WHERE parent_id = p_source;
  GET DIAGNOSTICS v_children = ROW_COUNT;

  -- the header's links: an entry that would appear twice under the same parent is dropped (when nothing hangs under it)
  WITH del AS (
    DELETE FROM public.menu_items m
    WHERE m.node_id = p_source
      AND EXISTS (SELECT 1 FROM public.menu_items x WHERE x.node_id = p_target AND x.channel = m.channel AND x.parent_id IS NOT DISTINCT FROM m.parent_id)
      AND NOT EXISTS (SELECT 1 FROM public.menu_items c WHERE c.parent_id = m.id)
    RETURNING m.*
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(del)), '[]'::jsonb) INTO v_menu_deleted FROM del;
  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) INTO v_menu_ids FROM public.menu_items WHERE node_id = p_source;
  UPDATE public.menu_items SET node_id = p_target WHERE node_id = p_source;
  GET DIAGNOSTICS v_menu = ROW_COUNT;

  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) INTO v_layout_ids FROM public.home_layout WHERE node_id = p_source;
  UPDATE public.home_layout SET node_id = p_target WHERE node_id = p_source;
  GET DIAGNOSTICS v_layout = ROW_COUNT;

  -- «أقسام المتجر»: the card of the source becomes the target's, or just goes when the target already has one
  SELECT sort_order INTO v_sort FROM public.store_departments WHERE node_id = p_source;
  IF FOUND THEN
    v_dept := 1;
    IF EXISTS (SELECT 1 FROM public.store_departments WHERE node_id = p_target) THEN
      DELETE FROM public.store_departments WHERE node_id = p_source;
      v_dept_info := jsonb_build_object('action', 'dropped', 'sort_order', v_sort);
    ELSE
      UPDATE public.store_departments SET node_id = p_target WHERE node_id = p_source;
      v_dept_info := jsonb_build_object('action', 'moved', 'sort_order', v_sort);
    END IF;
  END IF;

  -- the old address (and every address an earlier merge already sent here) keeps working
  SELECT COALESCE(jsonb_agg(old_id), '[]'::jsonb) INTO v_alias_ids FROM public.catalog_node_aliases WHERE node_id = p_source;
  UPDATE public.catalog_node_aliases SET node_id = p_target WHERE node_id = p_source;

  v_summary := jsonb_build_object(
    'source_name', s.name_ar,
    'target_name', COALESCE(v_name, t.name_ar),
    'books_moved', v_moved,
    'books_already_in_target', v_already,
    'children_moved', v_children,
    'menu_items', v_menu,
    'home_blocks', v_layout,
    'departments', v_dept
  );

  INSERT INTO public.catalog_node_aliases (old_id, old_slug, node_id, source_name, snapshot, moved, summary)
  VALUES (
    s.id, s.slug, p_target, s.name_ar, to_jsonb(s),
    jsonb_build_object(
      'source_id', s.id, 'target_id', t.id,
      'target_old_name', t.name_ar,
      'target_new_name', CASE WHEN v_name IS NOT NULL AND v_name IS DISTINCT FROM t.name_ar THEN to_jsonb(v_name) ELSE NULL END,
      'books', v_books, 'both', v_both, 'children', v_child_ids,
      'menu_ids', v_menu_ids, 'menu_deleted', v_menu_deleted, 'layout_ids', v_layout_ids,
      'department', v_dept_info, 'aliases', v_alias_ids
    ),
    v_summary
  )
  ON CONFLICT (old_id) DO UPDATE
    SET node_id = EXCLUDED.node_id, old_slug = EXCLUDED.old_slug, source_name = EXCLUDED.source_name,
        snapshot = EXCLUDED.snapshot, moved = EXCLUDED.moved, summary = EXCLUDED.summary, merged_at = now();

  DELETE FROM public.catalog_nodes WHERE id = p_source;

  -- renamed last: the source's name is free only once it is gone
  IF v_name IS NOT NULL AND v_name IS DISTINCT FROM t.name_ar THEN
    UPDATE public.catalog_nodes SET name_ar = v_name WHERE id = p_target;
  END IF;

  RETURN v_summary;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_merge_nodes(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_merge_nodes(uuid, uuid, text) TO authenticated;

-- ── undo ──
-- Puts back what one merge took away. Only the latest state of things is trusted: a book that was removed from the target since is
-- left alone, a primary category the book got elsewhere since is respected, a name or address taken since is worked around.
CREATE OR REPLACE FUNCTION public.catalog_unmerge_node(p_old_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.catalog_node_aliases%ROWTYPE;
  m jsonb;
  t public.catalog_nodes%ROWTYPE;
  v public.catalog_nodes%ROWTYPE;
  rec record;
  v_books integer := 0;
  v_children integer := 0;
  v_menu integer := 0;
  v_n integer;
  v_primary boolean;
BEGIN
  IF NOT public.has_catalog_permission() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO a FROM public.catalog_node_aliases WHERE old_id = p_old_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'there is no merge to undo for this item'; END IF;
  m := a.moved;
  IF m IS NULL THEN RAISE EXCEPTION 'this merge was made before undo existed'; END IF;
  IF a.node_id IS DISTINCT FROM (m ->> 'target_id')::uuid THEN
    RAISE EXCEPTION 'the item it was merged into was merged again later: undo that one first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_nodes WHERE id = p_old_id) THEN
    RAISE EXCEPTION 'this item exists again already';
  END IF;
  SELECT * INTO t FROM public.catalog_nodes WHERE id = a.node_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'the item it was merged into does not exist any more'; END IF;

  -- the survivor gets its old name back (when nobody renamed it since), so the item below can have its own name again
  IF m ->> 'target_new_name' IS NOT NULL AND t.name_ar = m ->> 'target_new_name' THEN
    UPDATE public.catalog_nodes SET name_ar = m ->> 'target_old_name' WHERE id = t.id;
  END IF;

  -- the item itself, with its own id; the old tables get their row back through the usual mirror
  v := jsonb_populate_record(NULL::public.catalog_nodes, a.snapshot);
  v.legacy_table := NULL;
  v.legacy_id := NULL;
  IF v.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.catalog_nodes WHERE id = v.parent_id) THEN
    v.parent_id := NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_nodes WHERE slug = v.slug) THEN
    v.slug := v.slug || '-' || left(v.id::text, 4);
  END IF;
  INSERT INTO public.catalog_nodes VALUES (v.*);

  -- books that were in both: the source's link comes back (primary again when it was, unless the book has another primary now)
  FOR rec IN SELECT * FROM jsonb_to_recordset(COALESCE(m -> 'both', '[]'::jsonb)) AS x(product_id uuid, was_primary boolean, sort_order integer, pinned boolean, created_at timestamptz) LOOP
    IF EXISTS (SELECT 1 FROM public.product_nodes WHERE product_id = rec.product_id AND node_id = t.id) THEN
      IF rec.was_primary THEN
        UPDATE public.product_nodes SET is_primary = false WHERE product_id = rec.product_id AND node_id = t.id AND is_primary;
      END IF;
      v_primary := rec.was_primary AND NOT EXISTS (SELECT 1 FROM public.product_nodes WHERE product_id = rec.product_id AND is_primary);
      INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order, pinned, created_at)
      VALUES (rec.product_id, p_old_id, v_primary, COALESCE(rec.sort_order, 0), COALESCE(rec.pinned, false), COALESCE(rec.created_at, now()))
      ON CONFLICT (product_id, node_id) DO NOTHING;
    END IF;
  END LOOP;

  -- books that moved over go back, with their order and primary flag
  FOR rec IN SELECT * FROM jsonb_to_recordset(COALESCE(m -> 'books', '[]'::jsonb)) AS x(product_id uuid, is_primary boolean, sort_order integer) LOOP
    v_primary := rec.is_primary AND NOT EXISTS (
      SELECT 1 FROM public.product_nodes WHERE product_id = rec.product_id AND is_primary AND node_id <> t.id
    );
    UPDATE public.product_nodes SET node_id = p_old_id, is_primary = v_primary, sort_order = COALESCE(rec.sort_order, 0)
    WHERE product_id = rec.product_id AND node_id = t.id
      AND NOT EXISTS (SELECT 1 FROM public.product_nodes x WHERE x.product_id = rec.product_id AND x.node_id = p_old_id);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_books := v_books + v_n;
  END LOOP;

  -- what was under it
  UPDATE public.catalog_nodes SET parent_id = p_old_id
  WHERE parent_id = t.id AND id IN (SELECT (jsonb_array_elements_text(COALESCE(m -> 'children', '[]'::jsonb)))::uuid);
  GET DIAGNOSTICS v_children = ROW_COUNT;

  -- the header's links
  UPDATE public.menu_items SET node_id = p_old_id
  WHERE node_id = t.id AND id IN (SELECT (jsonb_array_elements_text(COALESCE(m -> 'menu_ids', '[]'::jsonb)))::uuid);
  GET DIAGNOSTICS v_menu = ROW_COUNT;
  INSERT INTO public.menu_items
  SELECT d.* FROM jsonb_populate_recordset(NULL::public.menu_items, COALESCE(m -> 'menu_deleted', '[]'::jsonb)) d
  WHERE d.parent_id IS NULL OR EXISTS (SELECT 1 FROM public.menu_items p WHERE p.id = d.parent_id)
  ON CONFLICT (id) DO NOTHING;

  -- home shelves
  UPDATE public.home_layout SET node_id = p_old_id
  WHERE node_id = t.id AND id IN (SELECT (jsonb_array_elements_text(COALESCE(m -> 'layout_ids', '[]'::jsonb)))::uuid);

  -- «أقسام المتجر»
  IF m -> 'department' IS NOT NULL AND jsonb_typeof(m -> 'department') = 'object' THEN
    IF m -> 'department' ->> 'action' = 'moved' THEN
      UPDATE public.store_departments SET node_id = p_old_id WHERE node_id = t.id;
    ELSE
      INSERT INTO public.store_departments (node_id, sort_order)
      VALUES (p_old_id, COALESCE((m -> 'department' ->> 'sort_order')::integer, 0))
      ON CONFLICT (node_id) DO NOTHING;
    END IF;
  END IF;

  -- addresses that an earlier merge sent to the item go back to it
  UPDATE public.catalog_node_aliases SET node_id = p_old_id
  WHERE old_id IN (SELECT (jsonb_array_elements_text(COALESCE(m -> 'aliases', '[]'::jsonb)))::uuid);

  DELETE FROM public.catalog_node_aliases WHERE old_id = p_old_id;

  RETURN jsonb_build_object(
    'restored_name', v.name_ar,
    'target_name', (SELECT name_ar FROM public.catalog_nodes WHERE id = t.id),
    'books_restored', v_books,
    'children_restored', v_children,
    'menu_items', v_menu
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_unmerge_node(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_unmerge_node(uuid) TO authenticated;

-- ── the dashboard's list of merges that can be undone ──
CREATE OR REPLACE FUNCTION public.catalog_merge_history(p_limit integer DEFAULT 20)
RETURNS TABLE (old_id uuid, source_name text, target_id uuid, target_name text, merged_at timestamptz, summary jsonb, can_undo boolean)
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
  SELECT a.old_id, a.source_name, a.node_id, n.name_ar, a.merged_at, a.summary,
         (a.moved IS NOT NULL AND a.node_id = (a.moved ->> 'target_id')::uuid)
  FROM public.catalog_node_aliases a
  JOIN public.catalog_nodes n ON n.id = a.node_id
  WHERE a.moved IS NOT NULL
  ORDER BY a.merged_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_merge_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_merge_history(integer) TO authenticated;
