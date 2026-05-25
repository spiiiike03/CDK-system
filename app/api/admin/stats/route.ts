import { NextRequest } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { ensureSchema, sql } from "@/lib/db";
import { json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertAdmin(request);
    await ensureSchema();
    const [row] = await sql`
      select
        count(*) filter (where status = 'available')::int as available_files,
        count(*) filter (where status = 'delivered')::int as delivered_files,
        count(*) filter (where status = 'disabled')::int as disabled_files,
        (select count(*)::int from cdk_codes) as total_cdks,
        (select count(*)::int from cdk_codes where status = 'active') as active_cdks,
        (select count(*)::int from redeem_records) as redeem_records
      from json_files
    `;
    return json({ ok: true, stats: row });
  } catch (error) {
    if (error instanceof Response) return error;
    return serverError(error);
  }
}
