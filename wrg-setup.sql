-- Will Ruby's Garage only. Additive and safe to run more than once.
-- Does not alter other family-app tables, roles, or buckets.
-- Run this in the Supabase SQL editor for project evgpnpqtnemlbnygpbxs.
-- Do not paste a service-role key into the app. Do not put the shop PIN in this file.
--
-- After this script succeeds, provision the shared shop sign-in:
-- 1. Authentication -> Users -> Add user.
--    Email: wrg-shop@garage.example
--    Password: the access prefix wrg-access- immediately followed by the shop PIN
--    the phones type. Set that password only in the Supabase dashboard.
-- 2. Copy that user's UUID and run, with the UUID in place of the placeholder:
--      insert into public.wrg_members (user_id)
--      values ('00000000-0000-0000-0000-000000000000')
--      on conflict (user_id) do nothing;
--    Replace the zero UUID before running. The placeholder is not a real member.
-- 3. Do not add maintenance or timekeeping users. Only wrg_members can read or write.

-- Create the membership table before wrg_is_member(). PostgreSQL checks a
-- SQL-language function body at creation time, so the table must already exist.
create table if not exists public.wrg_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.wrg_is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.wrg_members
    where user_id = auth.uid()
  );
$$;

revoke all on function public.wrg_is_member() from public;
revoke all on function public.wrg_is_member() from anon;
grant execute on function public.wrg_is_member() to authenticated;

create or replace function public.wrg_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' then
    new.version = coalesce(old.version, 0) + 1;
  elsif new.version is null or new.version < 1 then
    new.version = 1;
  end if;
  return new;
end;
$$;

create table if not exists public.wrg_settings (
  id integer primary key default 1 check (id = 1),
  business_name text not null default 'Will Ruby’s Garage',
  owner_name text not null default 'Will Ruby',
  address text not null default '',
  phone text not null default '',
  email text not null default 'Brennentrevor@yahoo.com',
  labor_rate numeric not null default 120,
  labor_cost_rate numeric not null default 40,
  tax_rate numeric not null default 6,
  parts_markup numeric not null default 40,
  terms text not null default 'Payment due upon completion. Thank you for your business!',
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.wrg_customers (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint,
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.wrg_vehicles (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint,
  customer_id uuid not null references public.wrg_customers (id) on delete cascade,
  year text not null default '',
  make text not null default '',
  model text not null default '',
  plate text not null default '',
  vin text not null default '',
  trim text not null default '',
  odometer text not null default '',
  engine_type text not null default '',
  engine_displacement text not null default '',
  fuel text not null default '',
  transmission_type text not null default '',
  transmission_spec text not null default '',
  oil_type text not null default '',
  oil_grade text not null default '',
  oil_spec text not null default '',
  oil_capacity text not null default '',
  oil_filter text not null default '',
  front_brake text not null default '',
  front_brake_notes text not null default '',
  rear_brake text not null default '',
  rear_brake_notes text not null default '',
  wiper_left text not null default '',
  wiper_right text not null default '',
  wiper_rear text not null default '',
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.wrg_quotes (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint,
  number text not null,
  doc_date date not null default current_date,
  status text not null default 'draft',
  customer_id uuid references public.wrg_customers (id) on delete set null,
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_email text not null default '',
  customer_address text not null default '',
  vehicle_id uuid,
  vehicle_desc text not null default '',
  vehicle_plate text not null default '',
  vehicle_vin text not null default '',
  vehicle_trim text not null default '',
  vehicle_odometer text not null default '',
  vehicle_specs jsonb not null default '{}'::jsonb,
  tax_rate numeric not null default 0,
  notes text not null default '',
  work_performed text not null default '',
  items jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.wrg_invoices (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint,
  number text not null,
  doc_date date not null default current_date,
  status text not null default 'sent',
  quote_id uuid,
  customer_id uuid references public.wrg_customers (id) on delete set null,
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_email text not null default '',
  customer_address text not null default '',
  vehicle_id uuid,
  vehicle_desc text not null default '',
  vehicle_plate text not null default '',
  vehicle_vin text not null default '',
  vehicle_trim text not null default '',
  vehicle_odometer text not null default '',
  vehicle_specs jsonb not null default '{}'::jsonb,
  tax_rate numeric not null default 0,
  notes text not null default '',
  work_performed text not null default '',
  items jsonb not null default '[]'::jsonb,
  paid_date date,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.wrg_time_entries (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint,
  entry_date date not null default current_date,
  hours numeric not null,
  description text not null default '',
  job_number text not null default '',
  rate numeric not null default 0,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.wrg_photos (
  id uuid primary key default gen_random_uuid(),
  doc_kind text not null check (doc_kind in ('quote', 'invoice')),
  doc_id uuid not null,
  storage_path text not null,
  caption text not null default '',
  photo_type text not null default 'before' check (photo_type in ('before', 'after')),
  sort_order integer not null default 0,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.wrg_vehicles add column if not exists trim text not null default '';
alter table public.wrg_vehicles add column if not exists odometer text not null default '';
alter table public.wrg_vehicles add column if not exists engine_type text not null default '';
alter table public.wrg_vehicles add column if not exists engine_displacement text not null default '';
alter table public.wrg_vehicles add column if not exists fuel text not null default '';
alter table public.wrg_vehicles add column if not exists transmission_type text not null default '';
alter table public.wrg_vehicles add column if not exists transmission_spec text not null default '';
alter table public.wrg_vehicles add column if not exists oil_type text not null default '';
alter table public.wrg_vehicles add column if not exists oil_grade text not null default '';
alter table public.wrg_vehicles add column if not exists oil_spec text not null default '';
alter table public.wrg_vehicles add column if not exists oil_capacity text not null default '';
alter table public.wrg_vehicles add column if not exists oil_filter text not null default '';
alter table public.wrg_vehicles add column if not exists front_brake text not null default '';
alter table public.wrg_vehicles add column if not exists front_brake_notes text not null default '';
alter table public.wrg_vehicles add column if not exists rear_brake text not null default '';
alter table public.wrg_vehicles add column if not exists rear_brake_notes text not null default '';
alter table public.wrg_vehicles add column if not exists wiper_left text not null default '';
alter table public.wrg_vehicles add column if not exists wiper_right text not null default '';
alter table public.wrg_vehicles add column if not exists wiper_rear text not null default '';
alter table public.wrg_quotes add column if not exists vehicle_trim text not null default '';
alter table public.wrg_quotes add column if not exists vehicle_odometer text not null default '';
alter table public.wrg_quotes add column if not exists vehicle_specs jsonb not null default '{}'::jsonb;
alter table public.wrg_invoices add column if not exists vehicle_trim text not null default '';
alter table public.wrg_invoices add column if not exists vehicle_odometer text not null default '';
alter table public.wrg_invoices add column if not exists vehicle_specs jsonb not null default '{}'::jsonb;

create unique index if not exists wrg_quotes_number_key on public.wrg_quotes (number);
create unique index if not exists wrg_invoices_number_key on public.wrg_invoices (number);
create index if not exists wrg_vehicles_customer_idx on public.wrg_vehicles (customer_id);
create index if not exists wrg_photos_doc_idx on public.wrg_photos (doc_kind, doc_id);

insert into public.wrg_settings (id)
values (1)
on conflict (id) do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'wrg_settings',
    'wrg_customers',
    'wrg_vehicles',
    'wrg_quotes',
    'wrg_invoices',
    'wrg_time_entries',
    'wrg_photos'
  ]
  loop
    execute format('drop trigger if exists wrg_touch on public.%I', table_name);
    execute format(
      'create trigger wrg_touch before insert or update on public.%I for each row execute function public.wrg_touch()',
      table_name
    );
  end loop;
end $$;

alter table public.wrg_members enable row level security;
alter table public.wrg_settings enable row level security;
alter table public.wrg_customers enable row level security;
alter table public.wrg_vehicles enable row level security;
alter table public.wrg_quotes enable row level security;
alter table public.wrg_invoices enable row level security;
alter table public.wrg_time_entries enable row level security;
alter table public.wrg_photos enable row level security;

revoke all on public.wrg_members from public, anon;
revoke all on public.wrg_settings from public, anon;
revoke all on public.wrg_customers from public, anon;
revoke all on public.wrg_vehicles from public, anon;
revoke all on public.wrg_quotes from public, anon;
revoke all on public.wrg_invoices from public, anon;
revoke all on public.wrg_time_entries from public, anon;
revoke all on public.wrg_photos from public, anon;

grant select on public.wrg_members to authenticated;
grant select, update on public.wrg_settings to authenticated;
grant select, insert, update, delete on public.wrg_customers to authenticated;
grant select, insert, update, delete on public.wrg_vehicles to authenticated;
grant select, insert, update, delete on public.wrg_quotes to authenticated;
grant select, insert, update, delete on public.wrg_invoices to authenticated;
grant select, insert, update, delete on public.wrg_time_entries to authenticated;
grant select, insert, update, delete on public.wrg_photos to authenticated;

drop policy if exists wrg_members_select_self on public.wrg_members;
create policy wrg_members_select_self on public.wrg_members
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists wrg_settings_select on public.wrg_settings;
create policy wrg_settings_select on public.wrg_settings
  for select to authenticated
  using (public.wrg_is_member());
drop policy if exists wrg_settings_update on public.wrg_settings;
create policy wrg_settings_update on public.wrg_settings
  for update to authenticated
  using (public.wrg_is_member())
  with check (public.wrg_is_member());

drop policy if exists wrg_customers_select on public.wrg_customers;
create policy wrg_customers_select on public.wrg_customers
  for select to authenticated using (public.wrg_is_member());
drop policy if exists wrg_customers_insert on public.wrg_customers;
create policy wrg_customers_insert on public.wrg_customers
  for insert to authenticated with check (public.wrg_is_member());
drop policy if exists wrg_customers_update on public.wrg_customers;
create policy wrg_customers_update on public.wrg_customers
  for update to authenticated
  using (public.wrg_is_member()) with check (public.wrg_is_member());
drop policy if exists wrg_customers_delete on public.wrg_customers;
create policy wrg_customers_delete on public.wrg_customers
  for delete to authenticated using (public.wrg_is_member());

drop policy if exists wrg_vehicles_select on public.wrg_vehicles;
create policy wrg_vehicles_select on public.wrg_vehicles
  for select to authenticated using (public.wrg_is_member());
drop policy if exists wrg_vehicles_insert on public.wrg_vehicles;
create policy wrg_vehicles_insert on public.wrg_vehicles
  for insert to authenticated with check (public.wrg_is_member());
drop policy if exists wrg_vehicles_update on public.wrg_vehicles;
create policy wrg_vehicles_update on public.wrg_vehicles
  for update to authenticated
  using (public.wrg_is_member()) with check (public.wrg_is_member());
drop policy if exists wrg_vehicles_delete on public.wrg_vehicles;
create policy wrg_vehicles_delete on public.wrg_vehicles
  for delete to authenticated using (public.wrg_is_member());

drop policy if exists wrg_quotes_select on public.wrg_quotes;
create policy wrg_quotes_select on public.wrg_quotes
  for select to authenticated using (public.wrg_is_member());
drop policy if exists wrg_quotes_insert on public.wrg_quotes;
create policy wrg_quotes_insert on public.wrg_quotes
  for insert to authenticated with check (public.wrg_is_member());
drop policy if exists wrg_quotes_update on public.wrg_quotes;
create policy wrg_quotes_update on public.wrg_quotes
  for update to authenticated
  using (public.wrg_is_member()) with check (public.wrg_is_member());
drop policy if exists wrg_quotes_delete on public.wrg_quotes;
create policy wrg_quotes_delete on public.wrg_quotes
  for delete to authenticated using (public.wrg_is_member());

drop policy if exists wrg_invoices_select on public.wrg_invoices;
create policy wrg_invoices_select on public.wrg_invoices
  for select to authenticated using (public.wrg_is_member());
drop policy if exists wrg_invoices_insert on public.wrg_invoices;
create policy wrg_invoices_insert on public.wrg_invoices
  for insert to authenticated with check (public.wrg_is_member());
drop policy if exists wrg_invoices_update on public.wrg_invoices;
create policy wrg_invoices_update on public.wrg_invoices
  for update to authenticated
  using (public.wrg_is_member()) with check (public.wrg_is_member());
drop policy if exists wrg_invoices_delete on public.wrg_invoices;
create policy wrg_invoices_delete on public.wrg_invoices
  for delete to authenticated using (public.wrg_is_member());

drop policy if exists wrg_time_select on public.wrg_time_entries;
create policy wrg_time_select on public.wrg_time_entries
  for select to authenticated using (public.wrg_is_member());
drop policy if exists wrg_time_insert on public.wrg_time_entries;
create policy wrg_time_insert on public.wrg_time_entries
  for insert to authenticated with check (public.wrg_is_member());
drop policy if exists wrg_time_update on public.wrg_time_entries;
create policy wrg_time_update on public.wrg_time_entries
  for update to authenticated
  using (public.wrg_is_member()) with check (public.wrg_is_member());
drop policy if exists wrg_time_delete on public.wrg_time_entries;
create policy wrg_time_delete on public.wrg_time_entries
  for delete to authenticated using (public.wrg_is_member());

drop policy if exists wrg_photos_select on public.wrg_photos;
create policy wrg_photos_select on public.wrg_photos
  for select to authenticated using (public.wrg_is_member());
drop policy if exists wrg_photos_insert on public.wrg_photos;
create policy wrg_photos_insert on public.wrg_photos
  for insert to authenticated with check (public.wrg_is_member());
drop policy if exists wrg_photos_update on public.wrg_photos;
create policy wrg_photos_update on public.wrg_photos
  for update to authenticated
  using (public.wrg_is_member()) with check (public.wrg_is_member());
drop policy if exists wrg_photos_delete on public.wrg_photos;
create policy wrg_photos_delete on public.wrg_photos
  for delete to authenticated using (public.wrg_is_member());

insert into storage.buckets (id, name, public)
values ('wrg-photos', 'wrg-photos', false)
on conflict (id) do update set public = false;

drop policy if exists wrg_storage_select on storage.objects;
create policy wrg_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'wrg-photos' and public.wrg_is_member());
drop policy if exists wrg_storage_insert on storage.objects;
create policy wrg_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wrg-photos' and public.wrg_is_member());
drop policy if exists wrg_storage_update on storage.objects;
create policy wrg_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'wrg-photos' and public.wrg_is_member())
  with check (bucket_id = 'wrg-photos' and public.wrg_is_member());
drop policy if exists wrg_storage_delete on storage.objects;
create policy wrg_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'wrg-photos' and public.wrg_is_member());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'wrg_settings',
    'wrg_customers',
    'wrg_vehicles',
    'wrg_quotes',
    'wrg_invoices',
    'wrg_time_entries',
    'wrg_photos'
  ]
  loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = table_name
       ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
