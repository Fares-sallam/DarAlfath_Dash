-- Home page controls: every block of the home page (the website's and the app's) can be scheduled (from / until), limited
-- to some countries and to phones or computers, and three new kinds of block exist: a shelf of hand-picked books
-- ('book-shelf'), a shelf filtered by a rule ('filter-shelf': newest / on offer / e-books, optionally inside one node)
-- and a free promo strip ('promo': words, a picture, a button).
--
-- ADDITIVE ONLY: new columns that are empty (or 'all') for every existing row, a guard trigger and one function. No
-- existing row changes, and the published app (which reads home_layout rows by section key) keeps working.

ALTER TABLE public.home_layout
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at   timestamptz,
  ADD COLUMN IF NOT EXISTS countries text[],
  ADD COLUMN IF NOT EXISTS devices   text NOT NULL DEFAULT 'all';

ALTER TABLE public.home_layout DROP CONSTRAINT IF EXISTS home_layout_devices_check;
ALTER TABLE public.home_layout ADD CONSTRAINT home_layout_devices_check CHECK (devices IN ('all', 'mobile', 'desktop'));
ALTER TABLE public.home_layout DROP CONSTRAINT IF EXISTS home_layout_window_check;
ALTER TABLE public.home_layout ADD CONSTRAINT home_layout_window_check CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);

-- Whatever the dashboard (or any other writer) sends, a row is kept readable by the pages: country codes are two upper-case
-- letters without repeats (none = every country), and each new kind carries the settings it needs, in a known shape.
CREATE OR REPLACE FUNCTION public.home_layout_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $m$
DECLARE
  cc    text[];
  ids   jsonb;
  clean jsonb;
  v     text;
BEGIN
  IF NEW.countries IS NOT NULL THEN
    SELECT array_agg(DISTINCT upper(btrim(c)) ORDER BY upper(btrim(c))) INTO cc FROM unnest(NEW.countries) AS c WHERE btrim(c) <> '';
    IF cc IS NULL THEN
      NEW.countries := NULL;
    ELSIF EXISTS (SELECT 1 FROM unnest(cc) AS c WHERE c !~ '^[A-Z]{2}$') THEN
      RAISE EXCEPTION 'bad country code' USING ERRCODE = '22023';
    ELSE
      NEW.countries := cc;
    END IF;
  END IF;

  IF NEW.kind IN ('book-shelf', 'filter-shelf', 'promo') THEN
    IF NEW.section_key NOT LIKE 'block:%' THEN
      RAISE EXCEPTION 'a % block is keyed block:<id>', NEW.kind USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(NEW.config) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'config must be an object' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NEW.kind = 'book-shelf' THEN
    ids := coalesce(NEW.config -> 'product_ids', '[]'::jsonb);
    IF jsonb_typeof(ids) <> 'array' OR jsonb_array_length(ids) > 40 THEN
      RAISE EXCEPTION 'a hand-picked shelf holds up to 40 books' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(ids) AS e
      WHERE jsonb_typeof(e) <> 'string' OR (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) THEN
      RAISE EXCEPTION 'product_ids must be book ids' USING ERRCODE = '22023';
    END IF;
    -- no repeats, the chosen order kept
    SELECT coalesce(jsonb_agg(to_jsonb(d.id) ORDER BY d.ord), '[]'::jsonb) INTO clean
    FROM (
      SELECT lower(s.id) AS id, min(s.ord) AS ord
      FROM (SELECT e.value #>> '{}' AS id, e.ordinality AS ord FROM jsonb_array_elements(ids) WITH ORDINALITY AS e) AS s
      GROUP BY lower(s.id)
    ) AS d;
    NEW.config := jsonb_set(NEW.config, '{product_ids}', clean);
  ELSIF NEW.kind = 'filter-shelf' THEN
    IF coalesce(NEW.config ->> 'source', '') NOT IN ('newest', 'offers', 'ebooks') THEN
      RAISE EXCEPTION 'source must be newest, offers or ebooks' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.kind = 'promo' THEN
    IF btrim(coalesce(NEW.title_ar, '')) = '' AND btrim(coalesce(NEW.subtitle_ar, '')) = '' AND btrim(coalesce(NEW.config ->> 'image_url', '')) = '' THEN
      RAISE EXCEPTION 'a promo strip needs words or a picture' USING ERRCODE = '22023';
    END IF;
    IF char_length(coalesce(NEW.title_ar, '')) > 120 OR char_length(coalesce(NEW.subtitle_ar, '')) > 400 THEN
      RAISE EXCEPTION 'promo text is too long' USING ERRCODE = '22023';
    END IF;
    v := btrim(coalesce(NEW.config ->> 'image_url', ''));
    IF v <> '' AND v !~ '^https://' THEN RAISE EXCEPTION 'the picture must be an https address' USING ERRCODE = '22023'; END IF;
    v := btrim(coalesce(NEW.config ->> 'link_url', ''));
    IF v <> '' AND v !~ '^/($|[^/])' THEN RAISE EXCEPTION 'the link must be a page inside the app (starts with /)' USING ERRCODE = '22023'; END IF;
    IF char_length(coalesce(NEW.config ->> 'button_label', '')) > 40 THEN RAISE EXCEPTION 'button text is too long' USING ERRCODE = '22023'; END IF;
    IF coalesce(NEW.config ->> 'tone', 'light') NOT IN ('light', 'brand', 'dark') THEN RAISE EXCEPTION 'tone must be light, brand or dark' USING ERRCODE = '22023'; END IF;
  END IF;

  RETURN NEW;
END;
$m$;

DROP TRIGGER IF EXISTS trg_home_layout_guard ON public.home_layout;
CREATE TRIGGER trg_home_layout_guard
  BEFORE INSERT OR UPDATE ON public.home_layout
  FOR EACH ROW EXECUTE FUNCTION public.home_layout_guard();

-- Replace some rows of a channel in ONE transaction (the «نسخ الترتيب» button): the listed keys are removed, the rows are
-- written. Runs as the caller, so the table's own policy (has_catalog_permission) decides who may.
CREATE OR REPLACE FUNCTION public.home_layout_apply(p_channel text, p_rows jsonb, p_remove text[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $m$
BEGIN
  IF p_channel NOT IN ('web', 'app') THEN RAISE EXCEPTION 'unknown channel' USING ERRCODE = '22023'; END IF;
  DELETE FROM public.home_layout WHERE channel = p_channel AND section_key = ANY (coalesce(p_remove, ARRAY[]::text[]));
  INSERT INTO public.home_layout (channel, section_key, kind, node_id, title_ar, subtitle_ar, item_limit, visible, sort_order, config, starts_at, ends_at, countries, devices, updated_at)
  SELECT p_channel, r.section_key, r.kind, r.node_id, r.title_ar, r.subtitle_ar, r.item_limit, coalesce(r.visible, true), coalesce(r.sort_order, 0),
         coalesce(r.config, '{}'::jsonb), r.starts_at, r.ends_at, r.countries, coalesce(r.devices, 'all'), now()
  FROM jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) AS r(
    section_key text, kind text, node_id uuid, title_ar text, subtitle_ar text, item_limit integer, visible boolean, sort_order integer,
    config jsonb, starts_at timestamptz, ends_at timestamptz, countries text[], devices text
  )
  ON CONFLICT (channel, section_key) DO UPDATE SET
    kind = EXCLUDED.kind, node_id = EXCLUDED.node_id, title_ar = EXCLUDED.title_ar, subtitle_ar = EXCLUDED.subtitle_ar,
    item_limit = EXCLUDED.item_limit, visible = EXCLUDED.visible, sort_order = EXCLUDED.sort_order, config = EXCLUDED.config,
    starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, countries = EXCLUDED.countries, devices = EXCLUDED.devices,
    updated_at = now();
END;
$m$;

REVOKE ALL ON FUNCTION public.home_layout_apply(text, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.home_layout_apply(text, jsonb, text[]) TO authenticated;
