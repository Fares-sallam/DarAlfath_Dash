-- ══════════════════════════════════════════════════════════════════════════
-- خريطة العرض: القايمة العلوية (رئيسي / فرعي) بجدول مخصوص
--
-- كل عنصر إما رئيسي (parent_id = null) أو فرعي داخل رئيسي معيّن (مستويين بس). العنصر ممكن يكون صفحة ثابتة (الرئيسية،
-- الكتب، تواصل معنا)، أو عنصر من شجرة الكتالوج، أو رابط، أو عنوان يجمّع فروع.
-- «الفروع التلقائية»: عنصر مربوط بعنصر شجرة وفيه auto_children → الموقع يعرض أبناءه من الشجرة كفروع، وأي صف يدوي
-- لنفس الابن (visible = false مثلًا) يتغلّب على التلقائي. زرار «تثبيت الفروع» بيحوّلها لصفوف يدوية تتحكم فيها.
-- التوافق: القايمة القديمة (site_content_settings.header_nav) بتتولّد تلقائيًا من العناصر الرئيسية (الصفحات الثابتة
-- والسلاسل)، فالموقع الحالي يفضل شغال لحد ما يقرأ الجدول ده مباشرة (المرحلة 3).
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.menu_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       text NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'app')),
  parent_id     uuid REFERENCES public.menu_items(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('home', 'books', 'contact', 'node', 'link', 'group')),
  node_id       uuid REFERENCES public.catalog_nodes(id) ON DELETE CASCADE,
  label_ar      text,
  label_en      text,
  url           text,
  sort_order    integer NOT NULL DEFAULT 0,
  visible       boolean NOT NULL DEFAULT true,
  auto_children boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_items_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT menu_items_node_fields CHECK ((kind = 'node' AND node_id IS NOT NULL) OR (kind <> 'node' AND node_id IS NULL)),
  CONSTRAINT menu_items_link_url CHECK (kind <> 'link' OR (url IS NOT NULL AND btrim(url) <> '')),
  CONSTRAINT menu_items_label CHECK (kind NOT IN ('link', 'group') OR (label_ar IS NOT NULL AND btrim(label_ar) <> '')),
  CONSTRAINT menu_items_auto CHECK (NOT auto_children OR kind = 'node')
);
CREATE INDEX IF NOT EXISTS menu_items_parent_idx ON public.menu_items (parent_id);

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS menu_items_public_read ON public.menu_items;
CREATE POLICY menu_items_public_read ON public.menu_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS menu_items_admin_all ON public.menu_items;
CREATE POLICY menu_items_admin_all ON public.menu_items
  FOR ALL TO authenticated USING (public.has_catalog_permission()) WITH CHECK (public.has_catalog_permission());

-- مستويين بس: الفرعي يتبع رئيسي، والرئيسي اللي جواه فروع ميتحوّلش لفرعي
CREATE OR REPLACE FUNCTION public.menu_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_parent public.menu_items%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.menu_items WHERE id = NEW.parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'the parent menu item does not exist';
    END IF;
    IF v_parent.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'a sub-item cannot hold other items: the menu has two levels (main and sub)';
    END IF;
    IF v_parent.channel <> NEW.channel THEN
      RAISE EXCEPTION 'a sub-item must be in the same channel as its main item';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.menu_items WHERE parent_id = NEW.id) THEN
      RAISE EXCEPTION 'this item has sub-items: move them out first, the menu has two levels (main and sub)';
    END IF;
    IF NEW.auto_children THEN
      RAISE EXCEPTION 'only a main item can fill its sub-items automatically';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_items_guard ON public.menu_items;
CREATE TRIGGER trg_menu_items_guard
  BEFORE INSERT OR UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.menu_items_guard();

-- القايمة القديمة (header_nav) = العناصر الرئيسية للموقع: الصفحات الثابتة والسلاسل
CREATE OR REPLACE FUNCTION public.menu_mirror_header_nav()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nav jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('key', x.k, 'visible', x.visible) ORDER BY x.sort_order, x.created_at), '[]'::jsonb)
  INTO v_nav
  FROM (
    SELECT CASE m.kind WHEN 'node' THEN 'series:' || m.node_id::text ELSE m.kind END AS k,
           m.visible, m.sort_order, m.created_at
    FROM public.menu_items m
    LEFT JOIN public.catalog_nodes n ON n.id = m.node_id
    WHERE m.channel = 'web' AND m.parent_id IS NULL
      AND (m.kind IN ('home', 'books', 'contact') OR (m.kind = 'node' AND n.type = 'series'))
  ) x;

  UPDATE public.site_content_settings
  SET header_nav = v_nav
  WHERE header_nav IS DISTINCT FROM v_nav;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.catalog_log_sync_error('menu_items', SQLERRM, jsonb_build_object('op', TG_OP));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_items_mirror ON public.menu_items;
CREATE TRIGGER trg_menu_items_mirror
  AFTER INSERT OR UPDATE OR DELETE ON public.menu_items
  FOR EACH STATEMENT EXECUTE FUNCTION public.menu_mirror_header_nav();

-- الترحيل الأولي من header_nav الحالي (مرة واحدة: لو الجدول فاضي)
INSERT INTO public.menu_items (kind, node_id, sort_order, visible, auto_children)
SELECT CASE WHEN k.key IN ('home', 'books', 'contact') THEN k.key ELSE 'node' END,
       CASE WHEN k.key LIKE 'series:%' THEN substr(k.key, 8)::uuid END,
       (e.ord - 1)::integer,
       k.visible,
       k.key LIKE 'series:%'
FROM public.site_content_settings sc,
     jsonb_array_elements(COALESCE(sc.header_nav, '[]'::jsonb)) WITH ORDINALITY AS e(item, ord),
     LATERAL (SELECT e.item ->> 'key' AS key, COALESCE((e.item ->> 'visible')::boolean, true) AS visible) k
WHERE NOT EXISTS (SELECT 1 FROM public.menu_items)
  AND (k.key IN ('home', 'books', 'contact')
       OR (k.key LIKE 'series:%' AND EXISTS (SELECT 1 FROM public.catalog_nodes n WHERE n.id = substr(k.key, 8)::uuid)));

-- سلاسل مش مذكورة في القايمة القديمة (كانت بتتضاف في الآخر تلقائيًا)
INSERT INTO public.menu_items (kind, node_id, sort_order, visible, auto_children)
SELECT 'node', n.id, (SELECT COALESCE(max(sort_order), 0) FROM public.menu_items WHERE parent_id IS NULL) + row_number() OVER (ORDER BY n.sort_web), true, true
FROM public.catalog_nodes n
WHERE n.type = 'series'
  AND EXISTS (SELECT 1 FROM public.menu_items)
  AND NOT EXISTS (SELECT 1 FROM public.menu_items m WHERE m.node_id = n.id AND m.parent_id IS NULL);

-- ── دوال للّوحة ──
CREATE OR REPLACE FUNCTION public.menu_reorder(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.menu_items m
  SET sort_order = o.pos - 1
  FROM unnest(p_ids) WITH ORDINALITY AS o(id, pos)
  WHERE m.id = o.id AND m.sort_order IS DISTINCT FROM o.pos - 1;
END;
$$;

-- نقل عنصر لجوه رئيسي (أو لمستوى رئيسي لو p_parent = null) وبيروح آخر الفروع
CREATE OR REPLACE FUNCTION public.menu_move_item(p_id uuid, p_parent uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_sort integer;
BEGIN
  SELECT COALESCE(max(sort_order) + 1, 0) INTO v_sort FROM public.menu_items WHERE parent_id IS NOT DISTINCT FROM p_parent AND id <> p_id;
  UPDATE public.menu_items
  SET parent_id = p_parent,
      sort_order = v_sort,
      auto_children = CASE WHEN p_parent IS NULL THEN auto_children ELSE false END
  WHERE id = p_id;
END;
$$;

-- «تثبيت الفروع»: يحوّل الفروع التلقائية لصفوف يدوية بنفس الترتيب
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
  IF NOT FOUND OR v_item.kind <> 'node' OR v_item.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'only a main item linked to a catalog node can fill its sub-items';
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

REVOKE EXECUTE ON FUNCTION public.menu_mirror_header_nav() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.menu_items_guard() FROM PUBLIC, anon, authenticated;
