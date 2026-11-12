BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS publisher text,
  ADD COLUMN IF NOT EXISTS page_count integer,
  ADD COLUMN IF NOT EXISTS publication_year integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_page_count_positive' AND conrelid = 'public.products'::regclass) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_page_count_positive CHECK (page_count IS NULL OR page_count > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_publication_year_valid' AND conrelid = 'public.products'::regclass) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_publication_year_valid CHECK (publication_year IS NULL OR publication_year BETWEEN 1000 AND 2100);
  END IF;
END $$;

-- Public storefronts need only these three fields, never the private pricing
-- or stock columns on products. The view deliberately exposes active books only.
CREATE OR REPLACE VIEW public.product_metadata_public AS
SELECT id AS product_id, publisher, page_count, publication_year
FROM public.products
WHERE is_active = true;
REVOKE ALL ON public.product_metadata_public FROM PUBLIC;
GRANT SELECT ON public.product_metadata_public TO anon, authenticated;

ALTER TABLE public.site_announcements
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_announcements_audience_valid' AND conrelid = 'public.site_announcements'::regclass) THEN
    ALTER TABLE public.site_announcements ADD CONSTRAINT site_announcements_audience_valid CHECK (audience IN ('all', 'web', 'app'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
