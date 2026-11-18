-- Dukaan Saathi schema. Run in the Supabase SQL editor (or `supabase db push`).
-- All access goes through the server with the service-role key. RLS is enabled
-- with no policies, so the public anon key cannot read or write anything.

create table if not exists shops (
  id text primary key,
  name text not null,
  owner_name text not null,
  owner_phone text unique,
  locality text not null default '',
  pincode text not null,
  region text not null default 'south',
  cluster_id text not null,
  cash_budget numeric not null default 15000,
  language text not null default 'en',
  open_to_joint_orders boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists distributors (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  name text not null,
  phone text,
  kind text not null default 'distributor',
  visit_days int[] not null default '{}',
  lead_days int not null default 2,
  accepts_returns boolean not null default false,
  categories text[] not null default '{}'
);

create table if not exists custom_skus (
  id text primary key,
  shop_id text references shops(id) on delete cascade,
  name text not null,
  brand text not null default '',
  category text not null,
  pack text not null default '',
  mrp numeric not null default 0,
  cost numeric not null default 0,
  case_qty int not null default 1,
  shelf_life_days int not null default 180,
  base_velocity numeric not null default 0.3,
  aliases text[] not null default '{}'
);

create table if not exists sku_aliases (
  id text primary key,
  shop_id text references shops(id) on delete cascade,
  sku_id text not null,
  alias text not null,
  unique nulls not distinct (shop_id, alias, sku_id)
);

create table if not exists bills (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  distributor_id text,
  distributor_name text not null default '',
  bill_date date not null,
  total numeric not null default 0,
  image_path text,
  parsed jsonb,
  created_at timestamptz not null default now()
);

create table if not exists batches (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  sku_id text not null,
  qty_in numeric not null,
  unit_cost numeric not null,
  expiry_date date,
  purchased_at timestamptz not null,
  bill_id text references bills(id) on delete set null,
  distributor_id text
);
create index if not exists batches_shop_idx on batches(shop_id, purchased_at);

create table if not exists stock_events (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  sku_id text not null,
  type text not null check (type in ('stockout','level','sale','writeoff')),
  qty numeric not null default 0,
  source text not null default 'web',
  ts timestamptz not null default now()
);
create index if not exists stock_events_shop_idx on stock_events(shop_id, ts);

create table if not exists credit_ledger (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  customer text not null,
  amount numeric not null,
  ts timestamptz not null default now(),
  source text not null default 'web'
);

create table if not exists orders (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  distributor_id text,
  distributor_name text not null default '',
  status text not null check (status in ('pending_approval','approved','rejected','cancelled')),
  total numeric not null default 0,
  items jsonb not null default '[]',
  created_by text not null,
  note text,
  joint_group_id text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists orders_shop_idx on orders(shop_id, created_at desc);

create table if not exists agent_runs (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  channel text not null,
  input text not null,
  steps jsonb not null default '[]',
  output text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists agent_runs_shop_idx on agent_runs(shop_id, created_at desc);

alter table shops enable row level security;
alter table distributors enable row level security;
alter table custom_skus enable row level security;
alter table sku_aliases enable row level security;
alter table bills enable row level security;
alter table batches enable row level security;
alter table stock_events enable row level security;
alter table credit_ledger enable row level security;
alter table orders enable row level security;
alter table agent_runs enable row level security;

-- Private bucket for bill / khata photos.
insert into storage.buckets (id, name, public) values ('bills', 'bills', false)
on conflict (id) do nothing;
