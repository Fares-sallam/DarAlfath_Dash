-- ══════════════════════════════════════════════════════════════════════════
-- المرحلة 1: شجرة الكتالوج الموحّدة (إضافة فقط)
--
-- ما يتغيّر: جداول وأعمدة ودوال و triggers جديدة. لا يُعدَّل ولا يُحذف أي صف في الجداول القديمة.
-- النسخ المنشورة من التطبيق والموقع تقرأ الجداول القديمة (categories, book_series, category_bar_items,
-- product_series, product_categories, products.category_id) كما هي، ولا تتأثر.
--
-- الاتجاه في هذه المرحلة: الجداول القديمة → الشجرة (الشجرة "ظل" يتحدّث تلقائيًا من اللوحة الحالية).
-- في المرحلة 2 (اللوحة الجديدة) يُعكَس الاتجاه ويصير مصدر الحقيقة هو الشجرة.
-- كل الدوال التي تكتب في الشجرة لا تُسقط أبدًا عملية الكتابة الأصلية: الخطأ يُسجَّل في catalog_sync_errors.
-- تحقق مستمر: select * from public.catalog_legacy_diff();  ← كل القيم لازم تكون 0.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0) صلاحية جديدة: can_manage_catalog (القيمة الابتدائية = can_manage_products، مرة واحدة) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_settings' AND column_name = 'can_manage_catalog'
  ) THEN
    ALTER TABLE public.admin_settings ADD COLUMN can_manage_catalog boolean NOT NULL DEFAULT false;
    UPDATE public.admin_settings SET can_manage_catalog = can_manage_products;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.has_catalog_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((auth.jwt() ->> 'email') = 'faresalsaid780@gmail.com', false)
      OR EXISTS (
        SELECT 1 FROM public.admin_settings
        WHERE user_id = auth.uid() AND can_manage_catalog = true
      );
$$;

-- ── 1) الجداول ──
CREATE TABLE IF NOT EXISTS public.catalog_nodes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id        uuid REFERENCES public.catalog_nodes(id) ON DELETE SET NULL,
  type             text NOT NULL DEFAULT 'category' CHECK (type IN ('section', 'series', 'category', 'collection')),
  name_ar          text NOT NULL CHECK (btrim(name_ar) <> ''),
  name_en          text,
  slug             text NOT NULL,
  description_ar   text,
  description_en   text,
  image_url        text,
  icon             text,
  color            text,
  is_active        boolean NOT NULL DEFAULT true,
  featured         boolean NOT NULL DEFAULT false,
  show_web         boolean NOT NULL DEFAULT true,
  show_app         boolean NOT NULL DEFAULT true,
  sort_web         integer NOT NULL DEFAULT 0,
  sort_app         integer NOT NULL DEFAULT 0,
  show_in_menu_web boolean NOT NULL DEFAULT false,
  show_in_bar_web  boolean NOT NULL DEFAULT false,
  show_in_bar_app  boolean NOT NULL DEFAULT false,
  hide_when_empty  boolean NOT NULL DEFAULT true,
  books_sort_web   text NOT NULL DEFAULT 'manual' CHECK (books_sort_web IN ('manual', 'newest', 'title', 'sales')),
  books_sort_app   text NOT NULL DEFAULT 'manual' CHECK (books_sort_app IN ('manual', 'newest', 'title', 'sales')),
  starts_at        timestamptz,
  ends_at          timestamptz,
  seo_title        text,
  seo_description  text,
  legacy_table     text CHECK (legacy_table IN ('book_series', 'categories')),
  legacy_id        uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_nodes_slug_key UNIQUE (slug),
  CONSTRAINT catalog_nodes_legacy_key UNIQUE (legacy_table, legacy_id),
  CONSTRAINT catalog_nodes_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS catalog_nodes_parent_idx ON public.catalog_nodes (parent_id);

CREATE TABLE IF NOT EXISTS public.product_nodes (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  node_id    uuid NOT NULL REFERENCES public.catalog_nodes(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  pinned     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, node_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_nodes_one_primary ON public.product_nodes (product_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS product_nodes_node_idx ON public.product_nodes (node_id);

-- تخطيط الصفحة الرئيسية لكل قناة (خامل حتى المرحلة 3/4: لا يقرؤه أحد الآن)
CREATE TABLE IF NOT EXISTS public.home_layout (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel      text NOT NULL CHECK (channel IN ('web', 'app')),
  section_key  text NOT NULL,
  kind         text NOT NULL,
  node_id      uuid REFERENCES public.catalog_nodes(id) ON DELETE SET NULL,
  title_ar     text,
  title_en     text,
  subtitle_ar  text,
  subtitle_en  text,
  item_limit   integer,
  visible      boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT home_layout_channel_key UNIQUE (channel, section_key)
);

CREATE TABLE IF NOT EXISTS public.catalog_sync_errors (
  id         bigserial PRIMARY KEY,
  source     text NOT NULL,
  message    text NOT NULL,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2) أمان الصفوف ──
ALTER TABLE public.catalog_nodes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_nodes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_layout         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_sync_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_nodes_public_read ON public.catalog_nodes;
CREATE POLICY catalog_nodes_public_read ON public.catalog_nodes
  FOR SELECT TO anon, authenticated
  USING (is_active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()));
DROP POLICY IF EXISTS catalog_nodes_admin_all ON public.catalog_nodes;
CREATE POLICY catalog_nodes_admin_all ON public.catalog_nodes
  FOR ALL TO authenticated USING (public.has_catalog_permission()) WITH CHECK (public.has_catalog_permission());

DROP POLICY IF EXISTS product_nodes_public_read ON public.product_nodes;
CREATE POLICY product_nodes_public_read ON public.product_nodes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS product_nodes_admin_all ON public.product_nodes;
CREATE POLICY product_nodes_admin_all ON public.product_nodes
  FOR ALL TO authenticated USING (public.has_catalog_permission()) WITH CHECK (public.has_catalog_permission());

DROP POLICY IF EXISTS home_layout_public_read ON public.home_layout;
CREATE POLICY home_layout_public_read ON public.home_layout FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS home_layout_admin_all ON public.home_layout;
CREATE POLICY home_layout_admin_all ON public.home_layout
  FOR ALL TO authenticated USING (public.has_catalog_permission()) WITH CHECK (public.has_catalog_permission());

DROP POLICY IF EXISTS catalog_sync_errors_admin_read ON public.catalog_sync_errors;
CREATE POLICY catalog_sync_errors_admin_read ON public.catalog_sync_errors
  FOR SELECT TO authenticated USING (public.has_catalog_permission());

-- ── 3) دوال مساعدة ──
CREATE OR REPLACE FUNCTION public.catalog_slugify(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(lower(btrim(p)), '[^a-z0-9ء-ي٠-٩]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'),
    '')
$$;

CREATE OR REPLACE FUNCTION public.catalog_unique_slug(p_base text, p_kind text)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_base text := COALESCE(public.catalog_slugify(p_base), p_kind);
  v_slug text := v_base;
BEGIN
  IF EXISTS (SELECT 1 FROM public.catalog_nodes WHERE slug = v_slug) THEN
    v_slug := v_base || '-' || p_kind;
  END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_nodes WHERE slug = v_slug) THEN
    v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  END IF;
  RETURN v_slug;
END;
$$;

-- منع الدورات في الشجرة
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
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_nodes_guard ON public.catalog_nodes;
CREATE TRIGGER trg_catalog_nodes_guard
  BEFORE INSERT OR UPDATE ON public.catalog_nodes
  FOR EACH ROW EXECUTE FUNCTION public.catalog_nodes_guard();

-- ── 4) الترحيل الأولي من الجداول القديمة (يُعاد تشغيله بأمان: ON CONFLICT DO NOTHING) ──
-- التصنيفات أولًا (الـslug القديم هو المرجع)، ثم السلاسل
INSERT INTO public.catalog_nodes (id, type, name_ar, slug, description_ar, legacy_table, legacy_id,
                                  show_in_bar_web, show_in_bar_app, sort_web, sort_app, created_at)
SELECT c.id, 'category', c.name, c.slug, c.description, 'categories', c.id,
       COALESCE(b.is_visible, true), COALESCE(b.is_visible, true),
       COALESCE(b.sort_order, 1000), COALESCE(b.sort_order, 1000), c.created_at
FROM public.categories c
LEFT JOIN public.category_bar_items b ON b.category_id = c.id
ON CONFLICT DO NOTHING;

INSERT INTO public.catalog_nodes (id, type, name_ar, slug, description_ar, image_url, is_active,
                                  sort_web, sort_app, legacy_table, legacy_id, created_at)
SELECT s.id, 'series', s.name, public.catalog_unique_slug(s.name, 'series'), s.description, s.cover_url,
       s.is_active, s.sort_order, s.sort_order, 'book_series', s.id, s.created_at
FROM public.book_series s
ORDER BY s.sort_order, s.created_at
ON CONFLICT DO NOTHING;

-- ظهور السلاسل في قائمة الموقع (من header_nav الحالي)
UPDATE public.catalog_nodes n
SET show_in_menu_web = COALESCE((
  SELECT (item ->> 'visible')::boolean
  FROM public.site_content_settings sc, jsonb_array_elements(COALESCE(sc.header_nav, '[]'::jsonb)) item
  WHERE item ->> 'key' = 'series:' || n.id::text
  LIMIT 1), false)
WHERE n.type = 'series';

-- التصنيف يتبع السلسلة اللي كل كتبه الأساسية فيها (لو بالتساوي بين سلسلتين يبقى بلا أب)
WITH per_series AS (
  SELECT p.category_id, ps.series_id, count(*) AS n
  FROM public.products p
  JOIN public.product_series ps ON ps.product_id = p.id
  WHERE p.category_id IS NOT NULL
  GROUP BY p.category_id, ps.series_id
), ranked AS (
  SELECT category_id, series_id, n,
         row_number() OVER (PARTITION BY category_id ORDER BY n DESC, series_id) AS rn,
         lead(n) OVER (PARTITION BY category_id ORDER BY n DESC, series_id) AS next_n
  FROM per_series
)
UPDATE public.catalog_nodes c
SET parent_id = r.series_id
FROM ranked r
WHERE r.rn = 1 AND COALESCE(r.next_n, 0) < r.n
  AND c.id = r.category_id AND c.type = 'category' AND c.parent_id IS NULL;

-- ربط الكتب: السلاسل، التصنيف الأساسي، التصنيفات الإضافية
INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order)
SELECT ps.product_id, ps.series_id, false, ps.sort_order
FROM public.product_series ps
JOIN public.catalog_nodes n ON n.id = ps.series_id
ON CONFLICT DO NOTHING;

INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order)
SELECT p.id, p.category_id, true, 0
FROM public.products p
JOIN public.catalog_nodes n ON n.id = p.category_id
WHERE p.category_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order)
SELECT pc.product_id, pc.category_id, false, 0
FROM public.product_categories pc
JOIN public.catalog_nodes n ON n.id = pc.category_id
ON CONFLICT DO NOTHING;

-- تخطيط الصفحة الرئيسية الحالي (الموقع من storefront_appearance، والتطبيق من الترتيب الثابت + app_home_settings)
INSERT INTO public.home_layout (channel, section_key, kind, visible, sort_order, item_limit)
SELECT 'web', sec.value ->> 'key', sec.value ->> 'key', COALESCE((sec.value ->> 'visible')::boolean, true),
       (sec.ordinality - 1)::int,
       CASE WHEN sec.value ->> 'key' = 'categories' THEN 3 END
FROM public.storefront_appearance sa,
     jsonb_array_elements(COALESCE(sa.home_sections, '[]'::jsonb)) WITH ORDINALITY AS sec(value, ordinality)
ON CONFLICT DO NOTHING;

INSERT INTO public.home_layout (channel, section_key, kind, visible, sort_order, item_limit)
SELECT 'app', v.key, v.key,
       CASE v.key
         WHEN 'departments'   THEN COALESCE((SELECT show_store_departments FROM public.app_home_settings LIMIT 1), true)
         WHEN 'new-arrivals'  THEN COALESCE((SELECT show_new_arrivals FROM public.app_home_settings LIMIT 1), true)
         WHEN 'offers'        THEN COALESCE((SELECT show_offers FROM public.app_home_settings LIMIT 1), true)
         WHEN 'ebook-library' THEN COALESCE((SELECT show_ebook_library FROM public.app_home_settings LIMIT 1), true)
         ELSE true
       END,
       v.ord,
       CASE WHEN v.key = 'categories' THEN 4 END
FROM (VALUES ('departments', 0), ('best-sellers', 1), ('new-arrivals', 2), ('offers', 3),
             ('ebook-library', 4), ('categories', 5), ('intro-videos', 6), ('features', 7)) AS v(key, ord)
ON CONFLICT DO NOTHING;

-- ── 5) مزامنة الجداول القديمة → الشجرة (لا تُسقط أبدًا الكتابة الأصلية) ──
CREATE OR REPLACE FUNCTION public.catalog_log_sync_error(p_source text, p_message text, p_detail jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.catalog_sync_errors (source, message, detail) VALUES (p_source, p_message, p_detail);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_sync_series()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.catalog_nodes WHERE legacy_table = 'book_series' AND legacy_id = OLD.id;
    RETURN NULL;
  END IF;

  INSERT INTO public.catalog_nodes (id, type, name_ar, slug, description_ar, image_url, is_active,
                                    sort_web, sort_app, legacy_table, legacy_id, created_at)
  VALUES (NEW.id, 'series', NEW.name, public.catalog_unique_slug(NEW.name, 'series'), NEW.description,
          NEW.cover_url, NEW.is_active, NEW.sort_order, NEW.sort_order, 'book_series', NEW.id, COALESCE(NEW.created_at, now()))
  ON CONFLICT (legacy_table, legacy_id) DO UPDATE
    SET name_ar = EXCLUDED.name_ar,
        description_ar = EXCLUDED.description_ar,
        image_url = EXCLUDED.image_url,
        is_active = EXCLUDED.is_active,
        sort_web = EXCLUDED.sort_web,
        sort_app = EXCLUDED.sort_app;
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
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.catalog_nodes WHERE legacy_table = 'categories' AND legacy_id = OLD.id;
    RETURN NULL;
  END IF;

  -- the category's own slug is the URL contract: a non-category node holding it gets another one
  UPDATE public.catalog_nodes
  SET slug = slug || '-' || type
  WHERE slug = NEW.slug AND legacy_table IS DISTINCT FROM 'categories';

  INSERT INTO public.catalog_nodes (id, type, name_ar, slug, description_ar, legacy_table, legacy_id,
                                    show_in_bar_web, show_in_bar_app, sort_web, sort_app, created_at)
  VALUES (NEW.id, 'category', NEW.name, NEW.slug, NEW.description, 'categories', NEW.id,
          true, true, 1000, 1000, COALESCE(NEW.created_at, now()))
  ON CONFLICT (legacy_table, legacy_id) DO UPDATE
    SET name_ar = EXCLUDED.name_ar,
        slug = EXCLUDED.slug,
        description_ar = EXCLUDED.description_ar;
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
  IF TG_OP = 'DELETE' THEN
    -- no row = "shown after the ordered ones"
    UPDATE public.catalog_nodes
    SET show_in_bar_web = true, show_in_bar_app = true, sort_web = 1000, sort_app = 1000
    WHERE legacy_table = 'categories' AND legacy_id = OLD.category_id;
    RETURN NULL;
  END IF;

  UPDATE public.catalog_nodes
  SET show_in_bar_web = NEW.is_visible, show_in_bar_app = NEW.is_visible,
      sort_web = NEW.sort_order, sort_app = NEW.sort_order
  WHERE legacy_table = 'categories' AND legacy_id = NEW.category_id;
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
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    DELETE FROM public.product_nodes
    WHERE product_id = OLD.product_id AND node_id = OLD.series_id AND is_primary = false;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order)
    VALUES (NEW.product_id, NEW.series_id, false, NEW.sort_order)
    ON CONFLICT (product_id, node_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;
  END IF;
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
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    DELETE FROM public.product_nodes
    WHERE product_id = OLD.product_id AND node_id = OLD.category_id AND is_primary = false;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order)
    VALUES (NEW.product_id, NEW.category_id, false, 0)
    ON CONFLICT (product_id, node_id) DO NOTHING;
  END IF;
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
  DELETE FROM public.product_nodes
  WHERE product_id = NEW.id AND is_primary = true AND node_id IS DISTINCT FROM NEW.category_id;

  IF NEW.category_id IS NOT NULL THEN
    INSERT INTO public.product_nodes (product_id, node_id, is_primary, sort_order)
    VALUES (NEW.id, NEW.category_id, true, 0)
    ON CONFLICT (product_id, node_id) DO UPDATE SET is_primary = true;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.catalog_log_sync_error('products.category_id', SQLERRM, jsonb_build_object('op', TG_OP));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_sync ON public.book_series;
CREATE TRIGGER trg_catalog_sync AFTER INSERT OR UPDATE OR DELETE ON public.book_series
  FOR EACH ROW EXECUTE FUNCTION public.catalog_sync_series();

DROP TRIGGER IF EXISTS trg_catalog_sync ON public.categories;
CREATE TRIGGER trg_catalog_sync AFTER INSERT OR UPDATE OR DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.catalog_sync_category();

DROP TRIGGER IF EXISTS trg_catalog_sync ON public.category_bar_items;
CREATE TRIGGER trg_catalog_sync AFTER INSERT OR UPDATE OR DELETE ON public.category_bar_items
  FOR EACH ROW EXECUTE FUNCTION public.catalog_sync_bar();

DROP TRIGGER IF EXISTS trg_catalog_sync ON public.product_series;
CREATE TRIGGER trg_catalog_sync AFTER INSERT OR UPDATE OR DELETE ON public.product_series
  FOR EACH ROW EXECUTE FUNCTION public.catalog_sync_product_series();

DROP TRIGGER IF EXISTS trg_catalog_sync ON public.product_categories;
CREATE TRIGGER trg_catalog_sync AFTER INSERT OR UPDATE OR DELETE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.catalog_sync_product_categories();

DROP TRIGGER IF EXISTS trg_catalog_sync ON public.products;
CREATE TRIGGER trg_catalog_sync AFTER INSERT OR UPDATE OF category_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.catalog_sync_product_primary();

-- ── 6) أدوات القراءة والتحقق ──
-- أعداد الكتب لكل عقدة (مباشر + مع الأحفاد) للكتب الظاهرة في الدولة (أو كل الدول لو null)
CREATE OR REPLACE FUNCTION public.catalog_node_counts(p_country text DEFAULT NULL)
RETURNS TABLE (node_id uuid, books_direct integer, books_total integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH RECURSIVE tree AS (
    SELECT id AS root, id AS node FROM public.catalog_nodes
    UNION ALL
    SELECT t.root, c.id FROM tree t JOIN public.catalog_nodes c ON c.parent_id = t.node
  ), visible AS (
    SELECT DISTINCT product_id FROM public.products_public_catalog
    WHERE p_country IS NULL OR country_code = p_country
  )
  SELECT n.id,
         (SELECT count(*) FROM public.product_nodes pn JOIN visible v ON v.product_id = pn.product_id
          WHERE pn.node_id = n.id)::integer,
         (SELECT count(DISTINCT pn.product_id) FROM tree t
          JOIN public.product_nodes pn ON pn.node_id = t.node
          JOIN visible v ON v.product_id = pn.product_id
          WHERE t.root = n.id)::integer
  FROM public.catalog_nodes n;
$$;

-- الجداول القديمة مقابل ما تقوله الشجرة: كل القيم لازم تكون 0
CREATE OR REPLACE FUNCTION public.catalog_legacy_diff()
RETURNS TABLE (check_name text, differences integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'series_rows', count(*)::integer FROM (
    SELECT id, name, description, cover_url, is_active, sort_order FROM public.book_series
    EXCEPT
    SELECT legacy_id, name_ar, description_ar, image_url, is_active, sort_web FROM public.catalog_nodes WHERE legacy_table = 'book_series'
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
    SELECT legacy_id, show_in_bar_web, sort_web FROM public.catalog_nodes WHERE legacy_table = 'categories'
  ) x
  UNION ALL
  SELECT 'product_series_links', count(*)::integer FROM (
    (SELECT product_id, series_id, sort_order FROM public.product_series
     EXCEPT
     SELECT pn.product_id, pn.node_id, pn.sort_order FROM public.product_nodes pn JOIN public.catalog_nodes n ON n.id = pn.node_id AND n.type = 'series')
    UNION ALL
    (SELECT pn.product_id, pn.node_id, pn.sort_order FROM public.product_nodes pn JOIN public.catalog_nodes n ON n.id = pn.node_id AND n.type = 'series'
     EXCEPT
     SELECT product_id, series_id, sort_order FROM public.product_series)
  ) x
  UNION ALL
  SELECT 'product_primary_category', count(*)::integer FROM (
    (SELECT id, category_id FROM public.products WHERE category_id IS NOT NULL
     EXCEPT
     SELECT product_id, node_id FROM public.product_nodes WHERE is_primary)
    UNION ALL
    (SELECT product_id, node_id FROM public.product_nodes WHERE is_primary
     EXCEPT
     SELECT id, category_id FROM public.products WHERE category_id IS NOT NULL)
  ) x
  UNION ALL
  SELECT 'product_extra_categories', count(*)::integer FROM (
    (SELECT product_id, category_id FROM public.product_categories
     EXCEPT
     SELECT pn.product_id, pn.node_id FROM public.product_nodes pn JOIN public.catalog_nodes n ON n.id = pn.node_id AND n.type = 'category' AND NOT pn.is_primary)
    UNION ALL
    (SELECT pn.product_id, pn.node_id FROM public.product_nodes pn JOIN public.catalog_nodes n ON n.id = pn.node_id AND n.type = 'category' AND NOT pn.is_primary
     EXCEPT
     SELECT product_id, category_id FROM public.product_categories)
  ) x
  UNION ALL
  SELECT 'sync_errors', count(*)::integer FROM public.catalog_sync_errors;
$$;
