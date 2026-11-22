-- «تفاصيل العرض»: what a book card, a book's page and the website's footer show, chosen in the dashboard and read by the
-- website and the app (see src/lib/displaySettings.ts for the shape and the defaults).
--
-- ADDITIVE ONLY: one new column on the existing single row of storefront_appearance. It starts as an empty object, which
-- every reader turns into exactly what the website and the app showed before, so nothing changes until the dashboard saves
-- something. The row's existing columns, policies (public read, admin write) and trigger are untouched.

alter table public.storefront_appearance
  add column if not exists display jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'storefront_appearance_display_shape' and conrelid = 'public.storefront_appearance'::regclass
  ) then
    alter table public.storefront_appearance
      add constraint storefront_appearance_display_shape
      check (jsonb_typeof(display) = 'object' and octet_length(display::text) <= 20000);
  end if;
end
$$;

comment on column public.storefront_appearance.display is
  'Display details for the website and the app (book card, book page, footer), a JSON object read through a whitelist; {} = the designed defaults.';
