-- «التحكم في التطبيق»: the app's operating switches, set in the dashboard and read by the app (see src/lib/appControl.ts):
--   maintenance    a maintenance screen (with an optional window)
--   update_policy  builds below a number must update, builds below another are offered an update
--   popup          one promotional pop-up (a campaign id decides who has already seen it)
--
-- ADDITIVE ONLY: one new table with a single row, created with everything switched off, so nothing changes in the app (or
-- anywhere) until the dashboard saves something. Only builds of the app that contain the code read it; the apps already
-- installed never ask for it. Public read (the app must read it before anyone signs in), admin write: the same policies as
-- the store's appearance row. The content is non-secret by nature (wording, build numbers, store addresses).

create table if not exists public.app_control (
  id            smallint primary key default 1 check (id = 1),
  maintenance   jsonb not null default '{}'::jsonb
    check (jsonb_typeof(maintenance) = 'object' and octet_length(maintenance::text) <= 8000),
  update_policy jsonb not null default '{}'::jsonb
    check (jsonb_typeof(update_policy) = 'object' and octet_length(update_policy::text) <= 8000),
  popup         jsonb not null default '{}'::jsonb
    check (jsonb_typeof(popup) = 'object' and octet_length(popup::text) <= 8000),
  updated_at    timestamptz not null default now()
);

comment on table public.app_control is
  'The app''s operating switches (one row, id = 1): maintenance screen, forced / recommended update by build number, promotional pop-up. Edited in the dashboard: التحكم في التطبيق.';

alter table public.app_control enable row level security;

drop policy if exists "public_read_app_control" on public.app_control;
create policy "public_read_app_control"
  on public.app_control
  for select
  to anon, authenticated
  using (true);

drop policy if exists "isadmin_full_app_control" on public.app_control;
create policy "isadmin_full_app_control"
  on public.app_control
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists trg_app_control_updated_at on public.app_control;
create trigger trg_app_control_updated_at
  before update on public.app_control
  for each row execute function public.set_updated_at();

-- The row exists from the start with everything off, so the dashboard has something to edit.
insert into public.app_control (id) values (1) on conflict (id) do nothing;
