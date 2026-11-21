-- Home page «الشكل» per block: how a shelf is laid out (a row that scrolls or a grid), the band behind a block, whether the
-- ornament divider is drawn above it, and the wording / destination of its «عرض الكل» link. Saved in home_layout.config.look
-- (any block, standard or added), for the website and the app alike.
--
-- ADDITIVE ONLY: the guard trigger function gains a check of config.look; no column or row changes, and a row with no `look`
-- is read exactly as before (rail, no band, divider automatic, the standard link).

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
  look  jsonb;
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

  -- the look of a block (any kind): known values only
  IF jsonb_typeof(NEW.config) = 'object' AND NEW.config ? 'look' THEN
    look := NEW.config -> 'look';
    IF jsonb_typeof(look) <> 'object' THEN
      RAISE EXCEPTION 'look must be an object' USING ERRCODE = '22023';
    END IF;
    IF look ? 'layout' AND coalesce(look ->> 'layout', '') NOT IN ('rail', 'grid') THEN
      RAISE EXCEPTION 'layout must be rail or grid' USING ERRCODE = '22023';
    END IF;
    IF look ? 'background' AND coalesce(look ->> 'background', '') NOT IN ('none', 'soft', 'mint') THEN
      RAISE EXCEPTION 'background must be none, soft or mint' USING ERRCODE = '22023';
    END IF;
    IF look ? 'divider' AND coalesce(look ->> 'divider', '') NOT IN ('auto', 'none') THEN
      RAISE EXCEPTION 'divider must be auto or none' USING ERRCODE = '22023';
    END IF;
    IF look ? 'link_hidden' AND jsonb_typeof(look -> 'link_hidden') <> 'boolean' THEN
      RAISE EXCEPTION 'link_hidden must be true or false' USING ERRCODE = '22023';
    END IF;
    IF look ? 'link_label' AND (jsonb_typeof(look -> 'link_label') <> 'string' OR char_length(look ->> 'link_label') > 24) THEN
      RAISE EXCEPTION 'link text is too long' USING ERRCODE = '22023';
    END IF;
    IF look ? 'link_url' AND (jsonb_typeof(look -> 'link_url') <> 'string' OR (look ->> 'link_url') !~ '^/($|[^/])') THEN
      RAISE EXCEPTION 'the link must be a page inside the app (starts with /)' USING ERRCODE = '22023';
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
