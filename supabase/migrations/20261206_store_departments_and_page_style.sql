-- «أقسام المتجر» cards on the website's home page, chosen from what already exists in the catalog tree, and the look of a node's own
-- page (a picture or video, a welcome text and how it is laid out). Additive only: nothing that exists is changed, the defaults
-- reproduce today's pages, and the new table is seeded with exactly the cards the website draws now (the series, in its order).

-- ── 1) the cards of «أقسام المتجر» ──
CREATE TABLE IF NOT EXISTS public.store_departments (
  node_id    uuid PRIMARY KEY REFERENCES public.catalog_nodes(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_departments_public_read ON public.store_departments;
CREATE POLICY store_departments_public_read ON public.store_departments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS store_departments_admin_all ON public.store_departments;
CREATE POLICY store_departments_admin_all ON public.store_departments
  FOR ALL TO authenticated USING (public.has_catalog_permission()) WITH CHECK (public.has_catalog_permission());

-- the cards the website draws today: every series, in the website's order
INSERT INTO public.store_departments (node_id, sort_order)
SELECT n.id, (row_number() OVER (ORDER BY n.sort_web, n.name_ar, n.id) - 1)::integer
FROM public.catalog_nodes n
WHERE n.type = 'series'
ON CONFLICT (node_id) DO NOTHING;

-- one write replaces the whole list (the order is the order of the array)
CREATE OR REPLACE FUNCTION public.store_departments_save(p_node_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_catalog_permission() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.store_departments WHERE NOT (node_id = ANY (COALESCE(p_node_ids, ARRAY[]::uuid[])));
  INSERT INTO public.store_departments (node_id, sort_order)
  SELECT id, (ord - 1)::integer FROM unnest(COALESCE(p_node_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS t(id, ord)
  ON CONFLICT (node_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;
END;
$$;

REVOKE ALL ON FUNCTION public.store_departments_save(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_departments_save(uuid[]) TO authenticated;

-- ── 2) the look of a node's own page ──
-- intro_media: 'auto' = a video when there is one (as before), otherwise nothing; 'video' / 'image' / 'none' say it outright
-- intro_text_pos: where the welcome text sits next to the picture or video: 'side' (as before), 'above' or 'below' it
ALTER TABLE public.catalog_nodes
  ADD COLUMN IF NOT EXISTS intro_media     text     NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS intro_image_url text,
  ADD COLUMN IF NOT EXISTS intro_align     text     NOT NULL DEFAULT 'right',
  ADD COLUMN IF NOT EXISTS intro_font_px   smallint NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS intro_pad_right smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intro_pad_left  smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intro_text_pos  text     NOT NULL DEFAULT 'side';

ALTER TABLE public.catalog_nodes DROP CONSTRAINT IF EXISTS catalog_nodes_intro_media_check;
ALTER TABLE public.catalog_nodes ADD CONSTRAINT catalog_nodes_intro_media_check CHECK (intro_media IN ('auto', 'video', 'image', 'none'));
ALTER TABLE public.catalog_nodes DROP CONSTRAINT IF EXISTS catalog_nodes_intro_align_check;
ALTER TABLE public.catalog_nodes ADD CONSTRAINT catalog_nodes_intro_align_check CHECK (intro_align IN ('right', 'center', 'left'));
ALTER TABLE public.catalog_nodes DROP CONSTRAINT IF EXISTS catalog_nodes_intro_font_px_check;
ALTER TABLE public.catalog_nodes ADD CONSTRAINT catalog_nodes_intro_font_px_check CHECK (intro_font_px BETWEEN 12 AND 40);
ALTER TABLE public.catalog_nodes DROP CONSTRAINT IF EXISTS catalog_nodes_intro_pad_check;
ALTER TABLE public.catalog_nodes ADD CONSTRAINT catalog_nodes_intro_pad_check CHECK (intro_pad_right BETWEEN 0 AND 240 AND intro_pad_left BETWEEN 0 AND 240);
ALTER TABLE public.catalog_nodes DROP CONSTRAINT IF EXISTS catalog_nodes_intro_text_pos_check;
ALTER TABLE public.catalog_nodes ADD CONSTRAINT catalog_nodes_intro_text_pos_check CHECK (intro_text_pos IN ('side', 'above', 'below'));
