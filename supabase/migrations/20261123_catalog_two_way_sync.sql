-- ══════════════════════════════════════════════════════════════════════════
-- المرحلة 2 (قاعدة البيانات): مزامنة الشجرة ↔ الجداول القديمة في الاتجاهين
--
-- لوحة «السلاسل والتصنيفات» الجديدة تكتب في الشجرة (catalog_nodes / product_nodes)، والنسخ المنشورة من التطبيق
-- (وشاشات اللوحة القديمة) لسه بتقرأ/تكتب في الجداول القديمة. فكل جانب بيتنسخ للتاني تلقائيًا:
--   • الشجرة → القديم: trigger على catalog_nodes و product_nodes (يكتب categories, book_series, category_bar_items,
--     product_series, product_categories, products.category_id). فشل الكتابة يلغي تعديل الشجرة كله برسالة واضحة.
--   • القديم → الشجرة: الـtriggers اللي اتعملت في المرحلة 1 (لا تُسقط الكتابة الأصلية)، اتحسّنت: تنسخ العمود اللي
--     اتغيّر فعلًا بس، فكتابة قديمة لا تمسح اختيارات الموقع/التطبيق المنفصلة.
-- منع الحلقات: قفل داخل المعاملة (catalog.sync_lock). القديم يعكس قناة التطبيق (أطول قناة بتفضل على الجداول القديمة)؛
-- الموقع بيقرأ الشجرة مباشرة من المرحلة 3.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.catalog_in_sync()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT COALESCE(current_setting('catalog.sync_lock', true), '') = '1' $$;

CREATE OR REPLACE FUNCTION public.catalog_legacy_table_for(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_type
    WHEN 'series' THEN 'book_series'
    WHEN 'category' THEN 'categories'
    WHEN 'collection' THEN 'categories'
    ELSE NULL
  END
$$;

-- ── حراسة الشجرة: لا حلقات، ولا نقل عنصر بين جدولين قديمين، ولا حذف عنصر فيه كتب أو أبناء ──
CREATE OR REPLACE FUNCTION public.catalog_nodes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_cursor uuid := NEW.parent_id;
  v_depth integer := 0;
BEGIN
  WHILE v_cursor IS NOT NULL LOOP
    IF v_cursor = NEW.id THEN
      RAISE EXCEPTION 'catalog node % cannot be placed under itself or one of its descendants', NEW.id;
    END IF;
    v_depth := v_depth + 1;
    IF v_depth > 50 THEN
      RAISE EXCEPTION 'catalog tree is deeper than 50 levels';
    END IF;
    SELECT parent_id INTO v_cursor FROM public.catalog_nodes WHERE id = v_cursor;
  END LOOP;

  IF TG_OP = 'UPDATE' AND OLD.legacy_table IS NOT NULL
     AND public.catalog_legacy_table_for(NEW.type) IS DISTINCT FROM OLD.legacy_table THEN
    RAISE EXCEPTION 'a % node cannot change to type % (it is stored as % in the old tables)', OLD.type, NEW.type, OLD.legacy_table;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_nodes_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF public.catalog_in_sync() THEN
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM public.product_nodes WHERE node_id = OLD.id) THEN
    RAISE EXCEPTION 'node "%" still has books: move or remove them first', OLD.name_ar;
  END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_nodes WHERE parent_id = OLD.id) THEN
    RAISE EXCEPTION 'node "%" still has children: move or delete them first', OLD.name_ar;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_nodes_before_delete ON public.catalog_nodes;
CREATE TRIGGER trg_catalog_nodes_before_delete
  BEFORE DELETE ON public.catalog_nodes
  FOR EACH ROW EXECUTE FUNCTION public.catalog_nodes_before_delete();

-- ══════════ الشجرة → القديم ══════════
CREATE OR REPLACE FUNCTION public.catalog_mirror_node()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_table text;
  v_visible boolean;
  v_bar_row public.category_bar_items%ROWTYPE;
BEGIN
  IF public.catalog_in_sync() THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.legacy_table = 'book_series' THEN
      PERFORM set_config('catalog.sync_lock', '1', true);
      DELETE FROM public.book_series WHERE id = OLD.legacy_id;
      PERFORM set_config('catalog.sync_lock', '', true);
    ELSIF OLD.legacy_table = 'categories' THEN
      PERFORM set_config('catalog.sync_lock', '1', true);
      DELETE FROM public.categories WHERE id = OLD.legacy_id;
      PERFORM set_config('catalog.sync_lock', '', true);
    END IF;
    RETURN NULL;
  END IF;

  v_table := public.catalog_legacy_table_for(NEW.type);
  IF v_table IS NULL THEN
    RETURN NULL;   -- «قسم»: مستوى جديد لا وجود له في الجداول القديمة
  END IF;

  PERFORM set_config('catalog.sync_lock', '1', true);

  IF v_table = 'book_series' THEN
    IF NEW.legacy_table IS NULL THEN
      INSERT INTO public.book_series (id, name, description, cover_url, is_active, sort_order)
      VALUES (NEW.id, NEW.name_ar, NEW.description_ar, NEW.image_url, NEW.is_active AND NEW.show_app, NEW.sort_app);
      UPDATE public.catalog_nodes SET legacy_table = 'book_series', legacy_id = NEW.id WHERE id = NEW.id;
    ELSE
      UPDATE public.book_series
      SET name = NEW.name_ar,
          description = NEW.description_ar,
          cover_url = NEW.image_url,
          is_active = NEW.is_active AND NEW.show_app,
          sort_order = NEW.sort_app
      WHERE id = NEW.legacy_id
        AND (name, description, cover_url, is_active, sort_order)
            IS DISTINCT FROM (NEW.name_ar, NEW.description_ar, NEW.image_url, NEW.is_active AND NEW.show_app, NEW.sort_app);
    END IF;
  ELSE
    IF NEW.legacy_table IS NULL THEN
      INSERT INTO public.categories (id, name, slug, description)
      VALUES (NEW.id, NEW.name_ar, NEW.slug, NEW.description_ar);
      UPDATE public.catalog_nodes SET legacy_table = 'categories', legacy_id = NEW.id WHERE id = NEW.id;
    ELSE
      UPDATE public.categories
      SET name = NEW.name_ar, slug = NEW.slug, description = NEW.description_ar
      WHERE id = NEW.legacy_id
        AND (name, slug, description) IS DISTINCT FROM (NEW.name_ar, NEW.slug, NEW.description_ar);
    END IF;

    -- the category bar: one row per category (visible flag + position), the app's values
    v_visible := NEW.is_active AND NEW.show_in_bar_app;
    SELECT * INTO v_bar_row FROM public.category_bar_items WHERE category_id = NEW.id;
    IF FOUND THEN
      IF v_bar_row.is_visible IS DISTINCT FROM v_visible OR v_bar_row.sort_order IS DISTINCT FROM NEW.sort_app THEN
        UPDATE public.category_bar_items SET is_visible = v_visible, sort_order = NEW.sort_app WHERE category_id = NEW.id;
      END IF;
    ELSIF v_visible = false OR NEW.sort_app <> 1000 THEN
      INSERT INTO public.category_bar_items (category_id, is_visible, sort_order) VALUES (NEW.id, v_visible, NEW.sort_app);
    END IF;
  END IF;

  PERFORM set_config('catalog.sync_lock', '', true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_mirror_node ON public.catalog_nodes;
CREATE TRIGGER trg_catalog_mirror_node
  AFTER INSERT OR UPDATE OR DELETE ON public.catalog_nodes
  FOR EACH ROW EXECUTE FUNCTION public.catalog_mirror_node();

CREATE OR REPLACE FUNCTION public.catalog_mirror_product_node()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_table text;
  v_old_legacy uuid;
  v_new_table text;
  v_new_legacy uuid;
BEGIN
  IF public.catalog_in_sync() THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('catalog.sync_lock', '1', true);

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT legacy_table, legacy_id INTO v_old_table, v_old_legacy FROM public.catalog_nodes WHERE id = OLD.node_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT legacy_table, legacy_id INTO v_new_table, v_new_legacy FROM public.catalog_nodes WHERE id = NEW.node_id;
  END IF;

  -- same link, only the position changed (series books order)
  IF TG_OP = 'UPDATE' AND OLD.node_id = NEW.node_id AND OLD.is_primary = NEW.is_primary THEN
    IF v_new_table = 'book_series' THEN
      UPDATE public.product_series SET sort_order = NEW.sort_order
      WHERE product_id = NEW.product_id AND series_id = v_new_legacy AND sort_order IS DISTINCT FROM NEW.sort_order;
    END IF;
    PERFORM set_config('catalog.sync_lock', '', true);
    RETURN NULL;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF v_old_table = 'book_series' THEN
      DELETE FROM public.product_series WHERE product_id = OLD.product_id AND series_id = v_old_legacy;
    ELSIF v_old_table = 'categories' THEN
      IF OLD.is_primary THEN
        UPDATE public.products SET category_id = NULL WHERE id = OLD.product_id AND category_id = v_old_legacy;
      ELSE
        DELETE FROM public.product_categories WHERE product_id = OLD.product_id AND category_id = v_old_legacy;
      END IF;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF v_new_table = 'book_series' THEN
      INSERT INTO public.product_series (product_id, series_id, sort_order)
      VALUES (NEW.product_id, v_new_legacy, NEW.sort_order)
      ON CONFLICT (product_id, series_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;
    ELSIF v_new_table = 'categories' THEN
      IF NEW.is_primary THEN
        UPDATE public.products SET category_id = v_new_legacy WHERE id = NEW.product_id AND category_id IS DISTINCT FROM v_new_legacy;
        DELETE FROM public.product_categories WHERE product_id = NEW.product_id AND category_id = v_new_legacy;
      ELSE
        INSERT INTO public.product_categories (product_id, category_id) VALUES (NEW.product_id, v_new_legacy)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  PERFORM set_config('catalog.sync_lock', '', true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_mirror_product_node ON public.product_nodes;
CREATE TRIGGER trg_catalog_mirror_product_node
  AFTER INSERT OR UPDATE OR DELETE ON public.product_nodes
  FOR EACH ROW EXECUTE FUNCTION public.catalog_mirror_product_node();

-- ══════════ القديم → الشجرة (نسخة محسّنة: القفل + العمود اللي اتغيّر بس) ══════════
CREATE OR REPLACE FUNCTION public.catalog_sync_series()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name boolean := true; v_desc boolean := true; v_cover boolean := true; v_active boolean := true; v_sort boolean := true;
BEGIN
  IF public.catalog_in_sync() THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('catalog.sync_lock', '1', true);

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.catalog_nodes WHERE legacy_table = 'book_series' AND legacy_id = OLD.id;
    PERFORM set_config('catalog.sync_lock', '', true);
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_name := OLD.name IS DISTINCT FROM NEW.name;
    v_desc := OLD.description IS DISTINCT FROM NEW.description;
    v_cover := OLD.cover_url IS DISTINCT FROM NEW.cover_url;
    v_active := OLD.is_active IS DISTINCT FROM NEW.is_active;
    v_sort := OLD.sort_order IS DISTINCT FROM NEW.sort_order;
  END IF;

  INSERT INTO public.catalog_nodes (id, type, name_ar, slug, description_ar, image_url, is_active,
                                    sort_web, sort_app, legacy_table, legacy_id, created_at)
  VALUES (NEW.id, 'series', NEW.name, public.catalog_unique_slug(NEW.name, 'series'), NEW.description,
          NEW.cover_url, NEW.is_active, NEW.sort_order, NEW.sort_order, 'book_series', NEW.id, COALESCE(NEW.created_at, now()))
  ON CONFLICT (legacy_table, legacy_id) DO UPDATE
    SET name_ar = CASE WHEN v_name THEN EXCLUDED.name_ar ELSE catalog_nodes.name_ar END,
        description_ar = CASE WHEN v_desc THEN EXCLUDED.description_ar ELSE catalog_nodes.description_ar END,
        image_url = CASE WHEN v_cover THEN EXCLUDED.image_url ELSE catalog_nodes.image_url END,
        is_active = CASE WHEN v_active THEN EXCLUDED.is_active ELSE catalog_nodes.is_active END,
        show_app = CASE WHEN v_active THEN true ELSE catalog_nodes.show_app END,
        sort_web = CASE WHEN v_sort THEN EXCLUDED.sort_web ELSE catalog_nodes.sort_web END,
        sort_app = CASE WHEN v_sort THEN EXCLUDED.sort_app ELSE catalog_nodes.sort_app END;

  PERFORM set_config('catalog.sync_lock', '', true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.catalog_log_sync_error('book_series', SQLERRM, jsonb_build_object('op', TG_OP));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_sync_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name boolean := true; v_slug boolean := true; v_desc boolean := true;
BEGIN
  IF public.catalog_in_sync() THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('catalog.sync_lock', '1', true);

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.catalog_nodes WHERE legacy_table = 'categories' AND legacy_id = OLD.id;
    PERFORM set_config('catalog.sync_lock', '', true);
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_name := OLD.name IS DISTINCT FROM NEW.name;
    v_slug := OLD.slug IS DISTINCT FROM NEW.slug;
    v_desc := OLD.description IS DISTINCT FROM NEW.description;
  END IF;

  UPDATE public.catalog_nodes
  SET slug = slug || '-' || type
  WHERE slug = NEW.slug AND legacy_table IS DISTINCT FROM 'categories';

  INSERT INTO public.catalog_nodes (id, type, name_ar, slug, description_ar, legacy_table, legacy_id,
                                    show_in_bar_web, show_in_bar_app, sort_web, sort_app, created_at)
  VALUES (NEW.id, 'category', NEW.name, NEW.slug, NEW.description, 'categories', NEW.id,
          true, true, 1000, 1000, COALESCE(NEW.created_at, now()))
  ON CONFLICT (legacy_table, legacy_id) DO UPDATE
    SET name_ar = CASE WHEN v_name THEN EXCLUDED.name_ar ELSE catalog_nodes.name_ar END,
        slug = CASE WHEN v_slug THEN EXCLUDED.slug ELSE catalog_nodes.slug END,
        description_ar = CASE WHEN v_desc THEN EXCLUDED.description_ar ELSE catalog_nodes.description_ar END;

  PERFORM set_config('catalog.sync_lock', '', true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.catalog_log_sync_error('categories', SQLERRM, jsonb_build_object('op', TG_OP));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_sync_bar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.catalog_in_sync() THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('catalog.sync_lock', '1', true);

  IF TG_OP = 'DELETE' THEN
    UPDATE public.catalog_nodes
    SET show_in_bar_web = true, show_in_bar_app = true, sort_web = 1000, sort_app = 1000
    WHERE legacy_table = 'categories' AND legacy_id = OLD.category_id;
  ELSE
    UPDATE public.catalog_nodes
    SET show_in_bar_web = NEW.is_visible, show_in_bar_app = NEW.is_visible,
        sort_web = NEW.sort_order, sort_app = NEW.sort_order
    WHERE legacy_table = 'categories' AND legacy_id = NEW.category_id;
  END IF;

  PERFORM set_config('catalog.sync_lock', '', true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.catalog_log_sync_error('category_bar_items', SQLERRM, jsonb_build_object('op', TG_OP));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_sync_product_series()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.catalog_in_sync() THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('catalog.sync_lock', '1', true);

  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    DELETE FROM public.product_nodes
    WHERE product_id = OLD.product_id AND node_id = OLD.series_id AND is_primary = false;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order)
    VALUES (NEW.product_id, NEW.series_id, false, NEW.sort_order)
    ON CONFLICT (product_id, node_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;
  END IF;

  PERFORM set_config('catalog.sync_lock', '', true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.catalog_log_sync_error('product_series', SQLERRM, jsonb_build_object('op', TG_OP));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_sync_product_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.catalog_in_sync() THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('catalog.sync_lock', '1', true);

  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    DELETE FROM public.product_nodes
    WHERE product_id = OLD.product_id AND node_id = OLD.category_id AND is_primary = false;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order)
    VALUES (NEW.product_id, NEW.category_id, false, 0)
    ON CONFLICT (product_id, node_id) DO NOTHING;
  END IF;

  PERFORM set_config('catalog.sync_lock', '', true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.catalog_log_sync_error('product_categories', SQLERRM, jsonb_build_object('op', TG_OP));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_sync_product_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.catalog_in_sync() THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('catalog.sync_lock', '1', true);

  DELETE FROM public.product_nodes
  WHERE product_id = NEW.id AND is_primary = true AND node_id IS DISTINCT FROM NEW.category_id;

  IF NEW.category_id IS NOT NULL THEN
    INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order)
    VALUES (NEW.id, NEW.category_id, true, 0)
    ON CONFLICT (product_id, node_id) DO UPDATE SET is_primary = true;
  END IF;

  PERFORM set_config('catalog.sync_lock', '', true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.catalog_log_sync_error('products.category_id', SQLERRM, jsonb_build_object('op', TG_OP));
  RETURN NULL;
END;
$$;

-- قائمة الموقع (header_nav) → علم الظهور في الشجرة
CREATE OR REPLACE FUNCTION public.catalog_sync_header_nav()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.catalog_in_sync() THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('catalog.sync_lock', '1', true);

  UPDATE public.catalog_nodes n
  SET show_in_menu_web = COALESCE((
    SELECT (item ->> 'visible')::boolean
    FROM jsonb_array_elements(COALESCE(NEW.header_nav, '[]'::jsonb)) item
    WHERE item ->> 'key' = 'series:' || n.id::text
    LIMIT 1), false)
  WHERE n.type = 'series';

  PERFORM set_config('catalog.sync_lock', '', true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.catalog_log_sync_error('site_content_settings.header_nav', SQLERRM, jsonb_build_object('op', TG_OP));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_sync ON public.site_content_settings;
CREATE TRIGGER trg_catalog_sync
  AFTER INSERT OR UPDATE OF header_nav ON public.site_content_settings
  FOR EACH ROW EXECUTE FUNCTION public.catalog_sync_header_nav();

-- ══════════ دوال جاهزة للّوحة (RLS بتحكمها: can_manage_catalog) ══════════
-- إعادة ترقيم أبناء عنصر (أو الجذور) بالترتيب المعطى، لقناة الموقع أو التطبيق أو الاتنين
CREATE OR REPLACE FUNCTION public.catalog_reorder_nodes(p_ids uuid[], p_channel text DEFAULT 'both')
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF p_channel NOT IN ('web', 'app', 'both') THEN
    RAISE EXCEPTION 'unknown channel %', p_channel;
  END IF;
  UPDATE public.catalog_nodes n
  SET sort_web = CASE WHEN p_channel IN ('web', 'both') THEN o.pos - 1 ELSE n.sort_web END,
      sort_app = CASE WHEN p_channel IN ('app', 'both') THEN o.pos - 1 ELSE n.sort_app END
  FROM unnest(p_ids) WITH ORDINALITY AS o(id, pos)
  WHERE n.id = o.id;
END;
$$;

-- ترقيم كتب عنصر بالترتيب المعطى
CREATE OR REPLACE FUNCTION public.catalog_reorder_node_books(p_node uuid, p_product_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.product_nodes pn
  SET sort_order = o.pos - 1
  FROM unnest(p_product_ids) WITH ORDINALITY AS o(id, pos)
  WHERE pn.node_id = p_node AND pn.product_id = o.id AND pn.sort_order IS DISTINCT FROM o.pos - 1;
END;
$$;

-- حفظ انتماء كتاب: سلاسله، تصنيفه الأساسي، تصنيفاته الإضافية. الروابط الباقية تحتفظ بمكانها
CREATE OR REPLACE FUNCTION public.catalog_assign_product(
  p_product uuid, p_series uuid[], p_primary uuid, p_extras uuid[])
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_series uuid[] := COALESCE(p_series, '{}');
  v_extras uuid[] := ARRAY(SELECT DISTINCT e FROM unnest(COALESCE(p_extras, '{}')) e WHERE e IS DISTINCT FROM p_primary);
  v_row record;
  v_next integer;
  v_id uuid;
BEGIN
  -- remove links that are no longer wanted
  DELETE FROM public.product_nodes pn
  USING public.catalog_nodes n
  WHERE pn.product_id = p_product AND n.id = pn.node_id
    AND (
      (n.type = 'series' AND NOT (pn.node_id = ANY (v_series)))
      OR (n.type IN ('category', 'collection') AND pn.is_primary AND pn.node_id IS DISTINCT FROM p_primary)
      OR (n.type IN ('category', 'collection') AND NOT pn.is_primary AND NOT (pn.node_id = ANY (v_extras)))
    );

  -- series: new ones go last in their series
  FOREACH v_id IN ARRAY v_series LOOP
    IF NOT EXISTS (SELECT 1 FROM public.product_nodes WHERE product_id = p_product AND node_id = v_id) THEN
      SELECT COALESCE(max(sort_order) + 1, 0) INTO v_next FROM public.product_nodes WHERE node_id = v_id;
      INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order) VALUES (p_product, v_id, false, v_next);
    END IF;
  END LOOP;

  -- primary category
  IF p_primary IS NOT NULL THEN
    INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order)
    VALUES (p_product, p_primary, true, 0)
    ON CONFLICT (product_id, node_id) DO UPDATE SET is_primary = true;
  END IF;

  -- extra categories
  FOREACH v_id IN ARRAY v_extras LOOP
    INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order)
    VALUES (p_product, v_id, false, 0)
    ON CONFLICT (product_id, node_id) DO NOTHING;
  END LOOP;
END;
$$;

-- ══════════ فحص المطابقة: القديم يعكس قناة التطبيق ══════════
CREATE OR REPLACE FUNCTION public.catalog_legacy_diff()
RETURNS TABLE (check_name text, differences integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'series_rows', count(*)::integer FROM (
    SELECT id, name, description, cover_url, is_active, sort_order FROM public.book_series
    EXCEPT
    SELECT legacy_id, name_ar, description_ar, image_url, (is_active AND show_app), sort_app FROM public.catalog_nodes WHERE legacy_table = 'book_series'
  ) x
  UNION ALL
  SELECT 'series_extra_nodes', count(*)::integer FROM public.catalog_nodes n
    WHERE n.legacy_table = 'book_series' AND NOT EXISTS (SELECT 1 FROM public.book_series s WHERE s.id = n.legacy_id)
  UNION ALL
  SELECT 'category_rows', count(*)::integer FROM (
    SELECT id, name, slug, description FROM public.categories
    EXCEPT
    SELECT legacy_id, name_ar, slug, description_ar FROM public.catalog_nodes WHERE legacy_table = 'categories'
  ) x
  UNION ALL
  SELECT 'category_extra_nodes', count(*)::integer FROM public.catalog_nodes n
    WHERE n.legacy_table = 'categories' AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = n.legacy_id)
  UNION ALL
  SELECT 'category_bar', count(*)::integer FROM (
    SELECT category_id, is_visible, sort_order FROM public.category_bar_items
    EXCEPT
    SELECT legacy_id, (is_active AND show_in_bar_app), sort_app FROM public.catalog_nodes WHERE legacy_table = 'categories'
  ) x
  UNION ALL
  SELECT 'product_series_links', count(*)::integer FROM (
    (SELECT product_id, series_id, sort_order FROM public.product_series
     EXCEPT
     SELECT pn.product_id, n.legacy_id, pn.sort_order FROM public.product_nodes pn JOIN public.catalog_nodes n ON n.id = pn.node_id AND n.legacy_table = 'book_series')
    UNION ALL
    (SELECT pn.product_id, n.legacy_id, pn.sort_order FROM public.product_nodes pn JOIN public.catalog_nodes n ON n.id = pn.node_id AND n.legacy_table = 'book_series'
     EXCEPT
     SELECT product_id, series_id, sort_order FROM public.product_series)
  ) x
  UNION ALL
  SELECT 'product_primary_category', count(*)::integer FROM (
    (SELECT id, category_id FROM public.products WHERE category_id IS NOT NULL
     EXCEPT
     SELECT pn.product_id, n.legacy_id FROM public.product_nodes pn JOIN public.catalog_nodes n ON n.id = pn.node_id WHERE pn.is_primary AND n.legacy_table = 'categories')
    UNION ALL
    (SELECT pn.product_id, n.legacy_id FROM public.product_nodes pn JOIN public.catalog_nodes n ON n.id = pn.node_id WHERE pn.is_primary AND n.legacy_table = 'categories'
     EXCEPT
     SELECT id, category_id FROM public.products WHERE category_id IS NOT NULL)
  ) x
  UNION ALL
  SELECT 'product_extra_categories', count(*)::integer FROM (
    (SELECT product_id, category_id FROM public.product_categories
     EXCEPT
     SELECT pn.product_id, n.legacy_id FROM public.product_nodes pn JOIN public.catalog_nodes n ON n.id = pn.node_id AND n.legacy_table = 'categories' AND NOT pn.is_primary)
    UNION ALL
    (SELECT pn.product_id, n.legacy_id FROM public.product_nodes pn JOIN public.catalog_nodes n ON n.id = pn.node_id AND n.legacy_table = 'categories' AND NOT pn.is_primary
     EXCEPT
     SELECT product_id, category_id FROM public.product_categories)
  ) x
  UNION ALL
  SELECT 'sync_errors', count(*)::integer FROM public.catalog_sync_errors;
$$;

-- الدوال الداخلية لا تُستدعى من الـAPI
REVOKE EXECUTE ON FUNCTION public.catalog_mirror_node() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.catalog_mirror_product_node() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.catalog_sync_header_nav() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.catalog_nodes_before_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.catalog_nodes_guard() FROM PUBLIC, anon, authenticated;
