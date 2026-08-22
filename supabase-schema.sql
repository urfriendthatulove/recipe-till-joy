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

-- rls
alter table public.materials enable row level security;
alter table public.stock_movements enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menus enable row level security;
alter table public.recipes enable row level security;
alter table public.sales enable row level security;

drop policy if exists "materials_all_access" on public.materials;
create policy "materials_all_access"
on public.materials
for all
using (true)
with check (true);

drop policy if exists "stock_movements_all_access" on public.stock_movements;
create policy "stock_movements_all_access"
on public.stock_movements
for all
using (true)
with check (true);

drop policy if exists "menu_categories_all_access" on public.menu_categories;
create policy "menu_categories_all_access"
on public.menu_categories
for all
using (true)
with check (true);

drop policy if exists "menus_all_access" on public.menus;
create policy "menus_all_access"
on public.menus
for all
using (true)
with check (true);

drop policy if exists "recipes_all_access" on public.recipes;
create policy "recipes_all_access"
on public.recipes
for all
using (true)
with check (true);

drop policy if exists "sales_all_access" on public.sales;
create policy "sales_all_access"
on public.sales
for all
using (true)
with check (true);
