-- صفحة عرض السلسلة/القسم: كلمة تعريفية + فيديو + شكل الصفحة (أشرطة أو شبكة) + عدد الكتب في كل شريط
ALTER TABLE public.catalog_nodes
  ADD COLUMN IF NOT EXISTS intro_ar text,
  ADD COLUMN IF NOT EXISTS intro_en text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS page_layout text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS strips_limit integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS show_as_strip boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_nodes_page_layout_check') THEN
    ALTER TABLE public.catalog_nodes ADD CONSTRAINT catalog_nodes_page_layout_check CHECK (page_layout IN ('auto', 'strips', 'grid'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_nodes_strips_limit_check') THEN
    ALTER TABLE public.catalog_nodes ADD CONSTRAINT catalog_nodes_strips_limit_check CHECK (strips_limit BETWEEN 1 AND 60);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_nodes_video_url_check') THEN
    ALTER TABLE public.catalog_nodes ADD CONSTRAINT catalog_nodes_video_url_check CHECK (video_url IS NULL OR video_url ~* '^https://');
  END IF;
END $$;
