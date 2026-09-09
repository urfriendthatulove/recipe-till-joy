-- Structured fields for store/fulfilment/payment context sent by the mobile
-- app's order-sync call. Previously this had no dedicated columns and was
-- being crammed into the free-text `note` field.
alter table public.mobile_orders
  add column if not exists store_id text,
  add column if not exists fulfilment_mode text
    check (fulfilment_mode in ('delivery', 'pickup', 'dine_in', 'pre_order')),
  add column if not exists payment_method text,
  add column if not exists delivery_fee numeric not null default 0,
  add column if not exists voucher_code text;

create index if not exists mobile_orders_store_id_idx on public.mobile_orders(store_id);
