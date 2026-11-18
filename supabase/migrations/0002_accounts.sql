-- Real shops: owner accounts, demo flag, WhatsApp link codes.
-- Safe to run on a database that already has 0001 and demo data.

alter table shops add column if not exists is_demo boolean not null default false;
alter table shops add column if not exists link_code text;
alter table shops add column if not exists link_code_expires timestamptz;
create unique index if not exists shops_link_code_idx on shops(link_code) where link_code is not null;

-- The three seeded demo shops.
update shops set is_demo = true where id in ('shop-sharma', 'shop-lakshmi', 'shop-balaji');

create table if not exists app_users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  shop_id text not null references shops(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists app_users_shop_idx on app_users(shop_id);

-- Server-only access, like every other table.
alter table app_users enable row level security;
