-- ============ 1. PROFILES ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  account_type text not null default 'customer' check (account_type in ('customer','restaurant_user','platform_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Users can view their own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Users can insert their own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "Users can update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and account_type <> 'platform_admin');

-- ============ 2. RESTAURANTS ============
create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  email text,
  phone text,
  address text,
  city text,
  postcode text,
  country text,
  logo_url text,
  active boolean not null default true,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.restaurants to anon;
grant select, update on public.restaurants to authenticated;
grant all on public.restaurants to service_role;
alter table public.restaurants enable row level security;

-- ============ 3. RESTAURANT USERS ============
create table if not exists public.restaurant_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','kitchen','waiter')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);
grant select on public.restaurant_users to authenticated;
grant all on public.restaurant_users to service_role;
alter table public.restaurant_users enable row level security;

-- ============ HELPER FUNCTIONS ============
create or replace function public.is_restaurant_member(_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.restaurant_users
    where user_id = auth.uid() and restaurant_id = _restaurant_id and active = true
  );
$$;

create or replace function public.has_restaurant_role(_restaurant_id uuid, _role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.restaurant_users
    where user_id = auth.uid() and restaurant_id = _restaurant_id
      and active = true and role = _role
  );
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_type = 'platform_admin'
  );
$$;

-- restaurants policies
create policy "Public can view approved active restaurants" on public.restaurants
  for select to anon, authenticated using (approved = true and active = true);
create policy "Members can view their restaurant" on public.restaurants
  for select to authenticated using (public.is_restaurant_member(id));
create policy "Owners can update their restaurant" on public.restaurants
  for update to authenticated using (public.has_restaurant_role(id, 'owner'))
  with check (public.has_restaurant_role(id, 'owner'));

-- restaurant_users policies
create policy "Members can view their restaurant team" on public.restaurant_users
  for select to authenticated using (user_id = auth.uid() or public.is_restaurant_member(restaurant_id));

-- ============ 4. RESTAURANT TABLES ============
create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_number text not null,
  name text,
  qr_token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, table_number)
);
grant select on public.restaurant_tables to authenticated;
grant all on public.restaurant_tables to service_role;
alter table public.restaurant_tables enable row level security;
create policy "Members can view their restaurant tables" on public.restaurant_tables
  for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy "Managers can manage their restaurant tables" on public.restaurant_tables
  for all to authenticated
  using (public.has_restaurant_role(restaurant_id,'owner') or public.has_restaurant_role(restaurant_id,'manager'))
  with check (public.has_restaurant_role(restaurant_id,'owner') or public.has_restaurant_role(restaurant_id,'manager'));

-- ============ 5. MENU CATEGORIES ============
create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.menu_categories to anon, authenticated;
grant insert, update, delete on public.menu_categories to authenticated;
grant all on public.menu_categories to service_role;
alter table public.menu_categories enable row level security;
create policy "Public can view active categories of live restaurants" on public.menu_categories
  for select to anon, authenticated using (
    active = true and exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.approved = true and r.active = true
    )
  );
create policy "Members can view their categories" on public.menu_categories
  for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy "Managers can manage categories" on public.menu_categories
  for all to authenticated
  using (public.has_restaurant_role(restaurant_id,'owner') or public.has_restaurant_role(restaurant_id,'manager'))
  with check (public.has_restaurant_role(restaurant_id,'owner') or public.has_restaurant_role(restaurant_id,'manager'));

-- ============ 6. MENU ITEMS ============
alter table public.menu_items
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade,
  add column if not exists category_id uuid references public.menu_categories(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
grant insert, update, delete on public.menu_items to authenticated;
grant all on public.menu_items to service_role;
create policy "Members can view their menu items" on public.menu_items
  for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy "Managers can manage menu items" on public.menu_items
  for all to authenticated
  using (public.has_restaurant_role(restaurant_id,'owner') or public.has_restaurant_role(restaurant_id,'manager'))
  with check (public.has_restaurant_role(restaurant_id,'owner') or public.has_restaurant_role(restaurant_id,'manager'));

-- ============ 7. ORDERS ============
alter table public.orders
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete restrict,
  add column if not exists customer_id uuid references auth.users(id) on delete set null,
  add column if not exists restaurant_table_id uuid references public.restaurant_tables(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('new','placed','accepted','preparing','ready','served','cancelled'));

-- ============ 8. ORDER ITEMS ============
alter table public.order_items add column if not exists line_total numeric;
update public.order_items set line_total = round(price * quantity, 2) where line_total is null;

-- ============ 9. ORDER STATUS HISTORY ============
create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select on public.order_status_history to authenticated;
grant all on public.order_status_history to service_role;
alter table public.order_status_history enable row level security;
create policy "Staff can view their restaurant order history" on public.order_status_history
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and public.is_restaurant_member(o.restaurant_id))
  );
create policy "Customers can view their own order history" on public.order_status_history
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );

-- ============ 10. THE GARDEN + BACKFILL ============
insert into public.restaurants (name, slug, approved, active, city, country)
values ('The Garden', 'the-garden', true, true, 'London', 'United Kingdom')
on conflict (slug) do nothing;

update public.menu_items set restaurant_id = (select id from public.restaurants where slug = 'the-garden')
  where restaurant_id is null;
update public.orders set restaurant_id = (select id from public.restaurants where slug = 'the-garden')
  where restaurant_id is null;

-- ============ 11. STAFF MIGRATION ============
insert into public.restaurant_users (restaurant_id, user_id, role, active)
select (select id from public.restaurants where slug = 'the-garden'), s.user_id, 'owner', true
from public.staff_users s
where s.active = true
on conflict (restaurant_id, user_id) do nothing;

-- ============ 12. TENANT-SCOPED ORDER POLICIES ============
drop policy if exists "Active staff can view orders" on public.orders;
drop policy if exists "Active staff can update orders" on public.orders;
drop policy if exists "Active staff can view order items" on public.order_items;

create policy "Members can view their restaurant orders" on public.orders
  for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy "Customers can view their own orders" on public.orders
  for select to authenticated using (customer_id = auth.uid());
create policy "Kitchen staff can update their restaurant orders" on public.orders
  for update to authenticated using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

create policy "Members can view their restaurant order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and public.is_restaurant_member(o.restaurant_id))
  );
create policy "Customers can view their own order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );

-- ============ updated_at triggers ============
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists set_restaurants_updated_at on public.restaurants;
create trigger set_restaurants_updated_at before update on public.restaurants for each row execute function public.set_updated_at();
drop trigger if exists set_menu_items_updated_at on public.menu_items;
create trigger set_menu_items_updated_at before update on public.menu_items for each row execute function public.set_updated_at();
drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

-- status history on insert/update
create or replace function public.log_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history (order_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end; $$;
drop trigger if exists log_order_status_insert on public.orders;
create trigger log_order_status_insert after insert on public.orders for each row execute function public.log_order_status();
drop trigger if exists log_order_status_update on public.orders;
create trigger log_order_status_update after update of status on public.orders for each row execute function public.log_order_status();

-- ============ 18. INDEXES ============
create index if not exists idx_restaurant_users_user_id on public.restaurant_users(user_id);
create index if not exists idx_restaurant_users_restaurant_id on public.restaurant_users(restaurant_id);
create index if not exists idx_menu_categories_restaurant_id on public.menu_categories(restaurant_id);
create index if not exists idx_menu_items_restaurant_id on public.menu_items(restaurant_id);
create index if not exists idx_menu_items_category_id on public.menu_items(category_id);
create index if not exists idx_orders_restaurant_id on public.orders(restaurant_id);
create index if not exists idx_orders_customer_id on public.orders(customer_id);
create index if not exists idx_orders_restaurant_table_id on public.orders(restaurant_table_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_created_at on public.orders(created_at);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_order_status_history_order_id on public.order_status_history(order_id);
create index if not exists idx_restaurant_tables_restaurant_id on public.restaurant_tables(restaurant_id);