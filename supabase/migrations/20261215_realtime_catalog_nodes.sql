-- Live updates for the catalog tree: a change to the categories / series / sections (catalog_nodes) or to where a book sits
-- (product_nodes) reaches every open dashboard and app screen at once.
--
-- This file RECORDS what is already applied on the live project (migration «realtime_catalog_nodes», 2026-11-25).
-- It is idempotent: running it again changes nothing.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'catalog_nodes'
  ) then
    alter publication supabase_realtime add table public.catalog_nodes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_nodes'
  ) then
    alter publication supabase_realtime add table public.product_nodes;
  end if;
end $$;
