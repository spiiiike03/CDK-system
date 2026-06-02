import { neon } from "@neondatabase/serverless";

type NeonSql = ReturnType<typeof neon>;
type QueryRows = Record<string, any>[];

let client: NeonSql | null = null;

export function sql(strings: TemplateStringsArray, ...values: unknown[]): Promise<QueryRows> {
  if (!client) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required");
    }
    client = neon(databaseUrl);
  }
  return client(strings, ...(values as any[])) as Promise<QueryRows>;
}

let schemaReady: Promise<void> | null = null;

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = createSchema();
  }
  return schemaReady;
}

async function createSchema() {
  await sql`create extension if not exists pgcrypto`;
  await sql`
    create table if not exists json_files (
      id uuid primary key default gen_random_uuid(),
      original_name text not null,
      cdk_prefix text not null default 'CDK',
      content jsonb not null,
      status text not null default 'available'
        check (status in ('available', 'delivered', 'disabled')),
      imported_at timestamptz not null default now(),
      delivered_at timestamptz,
      delivered_cdk_id uuid
    )
  `;
  await sql`alter table json_files add column if not exists cdk_prefix text not null default 'CDK'`;
  await sql`
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
    )
  `;
  await sql`
    create table if not exists redeem_records (
      id uuid primary key default gen_random_uuid(),
      cdk_id uuid references cdk_codes(id),
      cdk_code text not null,
      file_ids uuid[] not null,
      delivered_count int not null,
      ip text,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists plus_orders (
      id uuid primary key default gen_random_uuid(),
      cdk_id uuid references cdk_codes(id),
      cdk_code text not null,
      status text not null default 'processing'
        check (status in ('processing', 'qr_ready', 'paid', 'failed', 'expired')),
      pix_task_id text,
      pix_order_id text,
      email text,
      backend_status text,
      error text,
      ip text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      paid_at timestamptz,
      expires_at timestamptz
    )
  `;
  await sql`create index if not exists json_files_status_idx on json_files(status, imported_at)`;
  await sql`create index if not exists json_files_prefix_status_idx on json_files(cdk_prefix, status, imported_at)`;
  await sql`create index if not exists cdk_codes_code_idx on cdk_codes(upper(code))`;
  await sql`create index if not exists redeem_records_created_idx on redeem_records(created_at desc)`;
  await sql`create index if not exists plus_orders_code_idx on plus_orders(upper(cdk_code), created_at desc)`;
  await sql`create index if not exists plus_orders_status_idx on plus_orders(status, updated_at desc)`;
}

export type JsonFileRow = {
  id: string;
  original_name: string;
  cdk_prefix: string;
  content?: unknown;
  status: "available" | "delivered" | "disabled";
  imported_at: string;
  delivered_at: string | null;
  delivered_cdk_id: string | null;
};

export type CdkRow = {
  id: string;
  code: string;
  status: "active" | "used" | "disabled";
  file_count: number;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
};

export type PlusOrderRow = {
  id: string;
  cdk_id: string;
  cdk_code: string;
  status: "processing" | "qr_ready" | "paid" | "failed" | "expired";
  pix_task_id: string | null;
  pix_order_id: string | null;
  email: string | null;
  backend_status: string | null;
  error: string | null;
  ip: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  expires_at: string | null;
};
