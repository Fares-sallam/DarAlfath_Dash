-- An invoice number of its own, separate from the order number (orders.id, «ORD-…»).
-- The owner types it in the order window if he wants one; left empty, the printed invoice shows the order number as its number.
-- Additive only: one nullable column and a unique index. No existing order row is changed.

alter table public.orders add column if not exists invoice_number text;

-- not blank, not absurdly long
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_invoice_number_len') then
    alter table public.orders
      add constraint orders_invoice_number_len
      check (invoice_number is null or char_length(btrim(invoice_number)) between 1 and 40);
  end if;
end $$;

-- two invoices never share a number (case and surrounding spaces ignored); many orders may have none
create unique index if not exists orders_invoice_number_uniq
  on public.orders (lower(btrim(invoice_number)))
  where invoice_number is not null;

comment on column public.orders.invoice_number is
  'Optional invoice number typed by an admin. NULL = the printed invoice uses the order number (orders.id). Unique when set.';
