create extension if not exists pgcrypto;

create table if not exists json_files (
  id uuid primary key default gen_random_uuid(),
  original_name text not null,
  content jsonb not null,
  status text not null default 'available'
    check (status in ('available', 'delivered', 'disabled')),
  imported_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivered_cdk_id uuid
);

create table if not exists cdk_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'active'
    check (status in ('active', 'used', 'disabled')),
  file_count int not null default 1 check (file_count > 0),
  max_uses int not null default 1 check (max_uses > 0),
  used_count int not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists redeem_records (
  id uuid primary key default gen_random_uuid(),
  cdk_id uuid references cdk_codes(id),
  cdk_code text not null,
  file_ids uuid[] not null,
  delivered_count int not null,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists json_files_status_idx on json_files(status, imported_at);
create index if not exists cdk_codes_code_idx on cdk_codes(upper(code));
create index if not exists redeem_records_created_idx on redeem_records(created_at desc);
