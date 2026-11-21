-- ══════════════════════════════════════════════════════════════════════════
-- القايمة العلوية: تعشيش لحد 4 مستويات + تجميع عناصر في مجموعة
--
-- قبل: مستويين (رئيسي / فرعي). بعد: رئيسي ← فرعي ← فرعي داخل فرعي… لحد 4 مستويات، عشان تقدر تجمّع عدة فروع في مجموعة
-- باسم (مثلًا «المواد» جواها القراءة والكتابة والحساب)، وكل مستوى بيفتح اللي جواه.
-- • الفروع التلقائية ممكن تتفعّل على أي عنصر مربوط بعنصر شجرة (مش الرئيسي بس).
-- • عنصر تلقائي بيتخفي لو العنصر نفسه موجود كصف يدوي في أي مكان تحت نفس الرئيسي (الدمج في مجموعة ميكرّرهوش).
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.menu_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_parent public.menu_items%ROWTYPE;
  v_cursor uuid;
  v_ancestors integer := 0;
  v_height integer := 0;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.menu_items WHERE id = NEW.parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'the parent menu item does not exist';
    END IF;
    IF v_parent.channel <> NEW.channel THEN
      RAISE EXCEPTION 'a sub-item must be in the same channel as its parent';
    END IF;

    v_cursor := NEW.parent_id;
    WHILE v_cursor IS NOT NULL LOOP
      IF v_cursor = NEW.id THEN
        RAISE EXCEPTION 'a menu item cannot be placed inside itself or one of its own sub-items';
      END IF;
      v_ancestors := v_ancestors + 1;
      IF v_ancestors > 20 THEN
        RAISE EXCEPTION 'the menu is too deep (at most 4 levels)';
      END IF;
      SELECT parent_id INTO v_cursor FROM public.menu_items WHERE id = v_cursor;
    END LOOP;

    IF TG_OP = 'UPDATE' THEN
      WITH RECURSIVE below AS (
        SELECT id, 1 AS lvl FROM public.menu_items WHERE parent_id = NEW.id
        UNION ALL
        SELECT m.id, b.lvl + 1 FROM public.menu_items m JOIN below b ON m.parent_id = b.id WHERE b.lvl < 10
      )
      SELECT COALESCE(max(lvl), 0) INTO v_height FROM below;
    END IF;

    -- the item sits at level (ancestors + 1); what is below it adds to that
    IF v_ancestors + 1 + v_height > 4 THEN
      RAISE EXCEPTION 'the menu has at most 4 levels (main item plus 3 levels of sub-items)';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.menu_move_item(p_id uuid, p_parent uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_sort integer;
BEGIN
  SELECT COALESCE(max(sort_order) + 1, 0) INTO v_sort FROM public.menu_items WHERE parent_id IS NOT DISTINCT FROM p_parent AND id <> p_id;
  UPDATE public.menu_items SET parent_id = p_parent, sort_order = v_sort WHERE id = p_id;
END;
$$;

-- «تثبيت الفروع»: أي عنصر مربوط بعنصر شجرة (رئيسي أو فرعي)
CREATE OR REPLACE FUNCTION public.menu_materialize_children(p_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_item public.menu_items%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO v_item FROM public.menu_items WHERE id = p_id;
  IF NOT FOUND OR v_item.kind <> 'node' THEN
    RAISE EXCEPTION 'only an item linked to a catalog node can fill its sub-items';
  END IF;

  INSERT INTO public.menu_items (channel, parent_id, kind, node_id, sort_order, visible)
  SELECT v_item.channel, v_item.id, 'node', c.id,
         (SELECT COALESCE(max(sort_order) + 1, 0) FROM public.menu_items WHERE parent_id = v_item.id) + (row_number() OVER (ORDER BY c.sort_web, c.name_ar) - 1)::integer,
         true
  FROM public.catalog_nodes c
  WHERE c.parent_id = v_item.node_id
    AND NOT EXISTS (SELECT 1 FROM public.menu_items m WHERE m.parent_id = v_item.id AND m.node_id = c.id);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.menu_items SET auto_children = false WHERE id = v_item.id;
  RETURN v_count;
END;
$$;

-- تجميع: ينشئ مجموعة باسم تحت p_parent، وينقل جواها العناصر الثابتة (p_item_ids) وأي فروع تلقائية (p_node_ids).
-- المجموعة بتاخد مكان أول عنصر اتجمّع. بيرجّع رقم المجموعة.
CREATE OR REPLACE FUNCTION public.menu_group_items(p_parent uuid, p_label_ar text, p_item_ids uuid[], p_node_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_parent public.menu_items%ROWTYPE;
  v_group uuid;
  v_sort integer;
  v_channel text;
  v_id uuid;
  v_pos integer := 0;
BEGIN
  IF p_label_ar IS NULL OR btrim(p_label_ar) = '' THEN
    RAISE EXCEPTION 'menu_items_label: the group needs a name';
  END IF;
  IF COALESCE(array_length(p_item_ids, 1), 0) + COALESCE(array_length(p_node_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'nothing to group';
  END IF;

  SELECT * INTO v_parent FROM public.menu_items WHERE id = p_parent;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the parent menu item does not exist';
  END IF;
  v_channel := v_parent.channel;

  SELECT COALESCE(min(sort_order), (SELECT COALESCE(max(sort_order) + 1, 0) FROM public.menu_items WHERE parent_id = p_parent))
  INTO v_sort FROM public.menu_items WHERE id = ANY (COALESCE(p_item_ids, '{}'));

  INSERT INTO public.menu_items (channel, parent_id, kind, label_ar, sort_order, visible)
  VALUES (v_channel, p_parent, 'group', btrim(p_label_ar), v_sort, true)
  RETURNING id INTO v_group;

  -- the group sits in the slot of the first grouped item; items after it keep their order
  FOREACH v_id IN ARRAY COALESCE(p_item_ids, '{}') LOOP
    UPDATE public.menu_items SET parent_id = v_group, sort_order = v_pos WHERE id = v_id AND parent_id IS NOT DISTINCT FROM p_parent;
    v_pos := v_pos + 1;
  END LOOP;

  FOREACH v_id IN ARRAY COALESCE(p_node_ids, '{}') LOOP
    INSERT INTO public.menu_items (channel, parent_id, kind, node_id, sort_order, visible)
    VALUES (v_channel, v_group, 'node', v_id, v_pos, true);
    v_pos := v_pos + 1;
  END LOOP;

  RETURN v_group;
END;
$$;

-- فك مجموعة: اللي جواها يطلع مكانها في مستوى المجموعة، والمجموعة تتحذف
CREATE OR REPLACE FUNCTION public.menu_ungroup(p_group uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_group public.menu_items%ROWTYPE;
  v_count integer;
  v_base integer;
BEGIN
  SELECT * INTO v_group FROM public.menu_items WHERE id = p_group;
  IF NOT FOUND OR v_group.kind <> 'group' THEN
    RAISE EXCEPTION 'only a group can be ungrouped';
  END IF;

  SELECT COALESCE(max(sort_order) + 1, 0) INTO v_base FROM public.menu_items WHERE parent_id IS NOT DISTINCT FROM v_group.parent_id AND id <> p_group;
  UPDATE public.menu_items m
  SET parent_id = v_group.parent_id, sort_order = v_base + s.rn
  FROM (SELECT id, (row_number() OVER (ORDER BY sort_order, created_at) - 1)::integer AS rn FROM public.menu_items WHERE parent_id = p_group) s
  WHERE m.id = s.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.menu_items WHERE id = p_group;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.menu_items_guard() FROM PUBLIC, anon, authenticated;
