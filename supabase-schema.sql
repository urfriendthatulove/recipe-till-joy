-- 1) materials
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supplier text,
  unit text not null check (unit in ('ml', 'g', 'pcs')),
  current_stock numeric not null default 0,
  min_stock numeric not null default 0,
  purchase_price numeric,
  pack_size numeric,
  cost_per_unit numeric not null default 0,
  material_type text not null default 'single' check (material_type in ('single', 'mix')),
  mix_components jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.materials
  add column if not exists material_type text default 'single';

alter table public.materials
  add column if not exists mix_components jsonb not null default '[]'::jsonb;

update public.materials
set material_type = 'single'
where material_type is null;

-- keep legacy rows compatible with newer app logic
alter table public.materials
  alter column material_type set not null,
  alter column material_type set default 'single';

alter table public.materials
  alter column mix_components set default '[]'::jsonb;

-- 2) stock_movements
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  type text not null check (type in ('in', 'out', 'adjustment', 'waste')),
  qty numeric not null default 0,
  balance_after numeric not null default 0,
  unit_cost numeric,
  ref_type text not null default 'manual' check (ref_type in ('purchase', 'sale', 'manual')),
  ref_id text,
  note text,
  created_at timestamptz not null default now()
);

-- 3) menu_categories
create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 4) menus
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null,
  category_id uuid references public.menu_categories(id) on delete set null,
  price numeric not null default 0,
  direct_cost numeric,
  recipe_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5) recipes
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  qty numeric not null default 0,
  created_at timestamptz not null default now()
);

-- 6) sales
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null,
  created_at timestamptz not null default now(),
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  net_sales numeric not null default 0,
  total_cost numeric not null default 0,
  profit numeric not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'qris', 'transfer')),
  note text,
  voided boolean not null default false
);

create extension if not exists pgcrypto;

-- 7) app_users (login aplikasi, password di-hash)
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  display_name text,
  role text not null check (role in ('admin', 'user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users
  add column if not exists password_hash text,
  add column if not exists updated_at timestamptz not null default now();

-- migrasi dari skema lama jika sebelumnya masih pakai kolom password plain text
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_users'
      and column_name = 'password'
  ) then
    execute $migrate$
      update public.app_users
      set password_hash = coalesce(password_hash, crypt(password, gen_salt('bf', 12)))
      where password_hash is null and password is not null
    $migrate$;

    execute 'alter table public.app_users drop column if exists password';
  end if;
end;
$$;

update public.app_users
set username = lower(trim(username)),
    role = lower(trim(role)),
    updated_at = now();

alter table public.app_users
  alter column password_hash set not null,
  alter column role set not null,
  alter column username set not null;

-- 8) app_sessions (token sesi di-hash)
create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

-- default akun awal (password di-hash)
insert into public.app_users (username, password_hash, display_name, role, is_active, created_at, updated_at)
values
  ('admin', crypt('admin123', gen_salt('bf', 12)), 'Manager', 'admin', true, now(), now()),
  ('user', crypt('user123', gen_salt('bf', 12)), 'Barista', 'user', true, now(), now())
on conflict (username) do update set
  password_hash = excluded.password_hash,
  display_name = excluded.display_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();

-- helper auth functions
create or replace function public.app_hash_token(p_token text)
returns text
language sql
immutable
as $$
  select encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.app_request_session_token()
returns text
language sql
stable
as $$
  select nullif((current_setting('request.headers', true)::jsonb ->> 'x-app-session'), '');
$$;

create or replace function public.app_current_actor()
returns table (
  user_id uuid,
  username text,
  display_name text,
  role text,
  session_token text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.username,
    u.display_name,
    u.role,
    public.app_request_session_token() as session_token
  from public.app_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token_hash = public.app_hash_token(public.app_request_session_token())
    and s.revoked_at is null
    and s.expires_at > now()
    and u.is_active = true
  limit 1;
$$;

create or replace function public.app_is_authenticated()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.app_current_actor());
$$;

create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.app_current_actor() limit 1;
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_role() = 'admin';
$$;

create or replace function public.app_login(p_username text, p_password text)
returns table (
  user_id uuid,
  username text,
  display_name text,
  role text,
  session_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users%rowtype;
  v_token text;
begin
  select *
  into v_user
  from public.app_users
  where username = lower(trim(p_username))
    and is_active = true
  limit 1;

  if not found then
    return;
  end if;

  if crypt(coalesce(p_password, ''), v_user.password_hash) <> v_user.password_hash then
    return;
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.app_sessions (user_id, token_hash, expires_at)
  values (v_user.id, public.app_hash_token(v_token), now() + interval '7 days');

  return query
  select v_user.id, v_user.username, v_user.display_name, v_user.role, v_token;
end;
$$;

create or replace function public.app_restore_session()
returns table (
  user_id uuid,
  username text,
  display_name text,
  role text,
  session_token text
)
language sql
stable
security definer
set search_path = public
as $$
  select user_id, username, display_name, role, session_token
  from public.app_current_actor();
$$;

create or replace function public.app_logout()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_sessions
  set revoked_at = now()
  where token_hash = public.app_hash_token(public.app_request_session_token())
    and revoked_at is null;

  return true;
end;
$$;

create or replace function public.app_create_sale(
  p_lines jsonb,
  p_payment_method text,
  p_bill_discount numeric default 0,
  p_note text default null
)
returns table (
  id uuid,
  sale_number text,
  created_at timestamptz,
  items jsonb,
  subtotal numeric,
  discount numeric,
  net_sales numeric,
  total_cost numeric,
  profit numeric,
  payment_method text,
  note text,
  voided boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_now timestamptz := now();
  v_sale_id uuid := gen_random_uuid();
  v_sale_number text;
  v_subtotal numeric := 0;
  v_line_discount numeric := 0;
  v_bill_discount numeric := 0;
  v_total_cost numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_line jsonb;
  v_menu public.menus%rowtype;
  v_qty numeric;
  v_discount numeric;
  v_line_cost numeric;
  v_recipe_cost numeric;
  v_need jsonb := '{}'::jsonb;
  v_key text;
  v_need_qty numeric;
  v_mat public.materials%rowtype;
  v_after numeric;
begin
  v_role := public.app_role();
  if v_role not in ('admin', 'user') then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if p_payment_method not in ('cash', 'qris', 'transfer') then
    raise exception 'metode pembayaran tidak valid';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'keranjang kosong';
  end if;

  v_sale_number :=
    'QNS-' || to_char(v_now, 'YYYYMMDD') || '-' ||
    lpad((
      select (count(*) + 1)::text
      from public.sales
      where created_at >= date_trunc('day', v_now)
        and created_at < date_trunc('day', v_now) + interval '1 day'
    ), 4, '0');

  for v_line in
    select value from jsonb_array_elements(p_lines)
  loop
    select *
    into v_menu
    from public.menus
    where id = (v_line ->> 'menu_item_id')::uuid
      and is_active = true
    limit 1;

    if not found then
      raise exception 'menu tidak ditemukan atau tidak aktif';
    end if;

    v_qty := greatest(coalesce((v_line ->> 'qty')::numeric, 0), 0);
    if v_qty <= 0 then
      continue;
    end if;

    v_discount := greatest(coalesce((v_line ->> 'discount')::numeric, 0), 0);

    select coalesce(sum(r.qty * m.cost_per_unit), 0)
    into v_recipe_cost
    from public.recipes r
    join public.materials m on m.id = r.material_id
    where r.menu_id = v_menu.id;

    v_line_cost := (v_recipe_cost + coalesce(v_menu.direct_cost, 0)) * v_qty;

    v_subtotal := v_subtotal + (v_menu.price * v_qty);
    v_discount := least(v_discount, (v_menu.price * v_qty));
    v_line_discount := v_line_discount + v_discount;
    v_total_cost := v_total_cost + v_line_cost;

    v_items := v_items || jsonb_build_object(
      'id', gen_random_uuid(),
      'menuItemId', v_menu.id,
      'nameSnapshot', v_menu.name,
      'priceSnapshot', v_menu.price,
      'qty', v_qty,
      'discount', v_discount,
      'lineNet', (v_menu.price * v_qty) - v_discount,
      'lineCost', v_line_cost
    );

    for v_key, v_need_qty in
      select r.material_id::text, sum(r.qty * v_qty)
      from public.recipes r
      where r.menu_id = v_menu.id
      group by r.material_id
    loop
      v_need := jsonb_set(
        v_need,
        array[v_key],
        to_jsonb(coalesce((v_need ->> v_key)::numeric, 0) + v_need_qty),
        true
      );
    end loop;
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'keranjang kosong';
  end if;

  v_bill_discount := least(greatest(coalesce(p_bill_discount, 0), 0), greatest(v_subtotal - v_line_discount, 0));

  for v_key, v_need_qty in
    select key, (value)::numeric
    from jsonb_each_text(v_need)
  loop
    select *
    into v_mat
    from public.materials
    where id = v_key::uuid
    for update;

    if not found then
      continue;
    end if;

    if v_mat.current_stock < v_need_qty then
      raise exception 'stok % tidak cukup', v_mat.name;
    end if;

    v_after := v_mat.current_stock - v_need_qty;

    update public.materials
    set current_stock = v_after,
        updated_at = v_now
    where id = v_mat.id;

    insert into public.stock_movements (
      id,
      material_id,
      type,
      qty,
      balance_after,
      ref_type,
      ref_id,
      note,
      created_at
    )
    values (
      gen_random_uuid(),
      v_mat.id,
      'out',
      v_need_qty,
      v_after,
      'sale',
      v_sale_id::text,
      'Penjualan ' || v_sale_number,
      v_now
    );
  end loop;

  insert into public.sales (
    id,
    sale_number,
    created_at,
    items,
    subtotal,
    discount,
    net_sales,
    total_cost,
    profit,
    payment_method,
    note,
    voided
  )
  values (
    v_sale_id,
    v_sale_number,
    v_now,
    v_items,
    v_subtotal,
    v_line_discount + v_bill_discount,
    v_subtotal - (v_line_discount + v_bill_discount),
    v_total_cost,
    (v_subtotal - (v_line_discount + v_bill_discount)) - v_total_cost,
    p_payment_method,
    nullif(trim(coalesce(p_note, '')), ''),
    false
  );

  return query
  select
    s.id,
    s.sale_number,
    s.created_at,
    s.items,
    s.subtotal,
    s.discount,
    s.net_sales,
    s.total_cost,
    s.profit,
    s.payment_method,
    s.note,
    s.voided
  from public.sales s
  where s.id = v_sale_id;
end;
$$;

create or replace function public.app_void_sale(p_sale_id uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_mv public.stock_movements%rowtype;
  v_mat public.materials%rowtype;
  v_now timestamptz := now();
begin
  if not public.app_is_admin() then
    raise exception 'hanya admin yang boleh membatalkan nota' using errcode = '42501';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'nota tidak ditemukan';
  end if;

  if v_sale.voided then
    raise exception 'nota sudah dibatalkan';
  end if;

  for v_mv in
    select *
    from public.stock_movements
    where ref_id = p_sale_id::text
      and type = 'out'
  loop
    select * into v_mat from public.materials where id = v_mv.material_id for update;
    if not found then
      continue;
    end if;

    update public.materials
    set current_stock = v_mat.current_stock + v_mv.qty,
        updated_at = v_now
    where id = v_mat.id;

    insert into public.stock_movements (
      id,
      material_id,
      type,
      qty,
      balance_after,
      ref_type,
      ref_id,
      note,
      created_at
    )
    values (
      gen_random_uuid(),
      v_mat.id,
      'in',
      v_mv.qty,
      v_mat.current_stock + v_mv.qty,
      'sale',
      p_sale_id::text,
      'Pembatalan ' || v_sale.sale_number || coalesce(' - ' || nullif(trim(p_reason), ''), ''),
      v_now
    );
  end loop;

  update public.sales
  set voided = true
  where id = p_sale_id;

  return true;
end;
$$;

-- indexes
create index if not exists materials_name_idx on public.materials(name);
create index if not exists materials_supplier_idx on public.materials(supplier);
create index if not exists materials_active_idx on public.materials(is_active);
create index if not exists stock_movements_material_idx on public.stock_movements(material_id, created_at desc);
create index if not exists menu_categories_sort_idx on public.menu_categories(sort_order);
create index if not exists menus_category_idx on public.menus(category_id, is_active);
create index if not exists recipes_menu_idx on public.recipes(menu_id);
create index if not exists recipes_material_idx on public.recipes(material_id);
create index if not exists sales_created_at_idx on public.sales(created_at desc);
create index if not exists sales_number_idx on public.sales(sale_number);
create index if not exists app_users_username_idx on public.app_users(username);
create index if not exists app_sessions_user_idx on public.app_sessions(user_id);
create index if not exists app_sessions_token_idx on public.app_sessions(token_hash);

-- rls
alter table public.materials enable row level security;
alter table public.stock_movements enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menus enable row level security;
alter table public.recipes enable row level security;
alter table public.sales enable row level security;
alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;

-- clear legacy permissive policies
drop policy if exists "materials_all_access" on public.materials;
drop policy if exists "stock_movements_all_access" on public.stock_movements;
drop policy if exists "menu_categories_all_access" on public.menu_categories;
drop policy if exists "menus_all_access" on public.menus;
drop policy if exists "recipes_all_access" on public.recipes;
drop policy if exists "sales_all_access" on public.sales;
drop policy if exists "app_users_read_access" on public.app_users;

-- no direct read/write for auth tables
drop policy if exists "app_users_no_direct_access" on public.app_users;
create policy "app_users_no_direct_access"
on public.app_users
for all
using (false)
with check (false);

drop policy if exists "app_sessions_no_direct_access" on public.app_sessions;
create policy "app_sessions_no_direct_access"
on public.app_sessions
for all
using (false)
with check (false);

-- materials
drop policy if exists "materials_read_authenticated" on public.materials;
create policy "materials_read_authenticated"
on public.materials
for select
using (public.app_is_authenticated());

drop policy if exists "materials_write_admin" on public.materials;
create policy "materials_write_admin"
on public.materials
for all
using (public.app_is_admin())
with check (public.app_is_admin());

-- stock movements
drop policy if exists "stock_movements_read_authenticated" on public.stock_movements;
create policy "stock_movements_read_authenticated"
on public.stock_movements
for select
using (public.app_is_authenticated());

drop policy if exists "stock_movements_write_admin" on public.stock_movements;
create policy "stock_movements_write_admin"
on public.stock_movements
for all
using (public.app_is_admin())
with check (public.app_is_admin());

-- categories
drop policy if exists "menu_categories_read_authenticated" on public.menu_categories;
create policy "menu_categories_read_authenticated"
on public.menu_categories
for select
using (public.app_is_authenticated());

drop policy if exists "menu_categories_write_admin" on public.menu_categories;
create policy "menu_categories_write_admin"
on public.menu_categories
for all
using (public.app_is_admin())
with check (public.app_is_admin());

-- menus
drop policy if exists "menus_read_authenticated" on public.menus;
create policy "menus_read_authenticated"
on public.menus
for select
using (public.app_is_authenticated());

drop policy if exists "menus_write_admin" on public.menus;
create policy "menus_write_admin"
on public.menus
for all
using (public.app_is_admin())
with check (public.app_is_admin());

-- recipes
drop policy if exists "recipes_read_authenticated" on public.recipes;
create policy "recipes_read_authenticated"
on public.recipes
for select
using (public.app_is_authenticated());

drop policy if exists "recipes_write_admin" on public.recipes;
create policy "recipes_write_admin"
on public.recipes
for all
using (public.app_is_admin())
with check (public.app_is_admin());

-- sales
drop policy if exists "sales_read_authenticated" on public.sales;
create policy "sales_read_authenticated"
on public.sales
for select
using (public.app_is_authenticated());

drop policy if exists "sales_write_admin" on public.sales;
create policy "sales_write_admin"
on public.sales
for all
using (public.app_is_admin())
with check (public.app_is_admin());

-- function permissions
grant execute on function public.app_login(text, text) to anon, authenticated;
grant execute on function public.app_restore_session() to anon, authenticated;
grant execute on function public.app_logout() to anon, authenticated;
grant execute on function public.app_create_sale(jsonb, text, numeric, text) to anon, authenticated;
grant execute on function public.app_void_sale(uuid, text) to anon, authenticated;

grant execute on function public.app_current_actor() to anon, authenticated;
grant execute on function public.app_is_authenticated() to anon, authenticated;
grant execute on function public.app_role() to anon, authenticated;
grant execute on function public.app_is_admin() to anon, authenticated;
