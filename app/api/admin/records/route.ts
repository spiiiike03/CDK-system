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
    const rows = await sql`
      select id, cdk_code, file_ids, delivered_count, ip, created_at
      from redeem_records
      order by created_at desc
      limit 200
    `;
    return json({ ok: true, items: rows });
  } catch (error) {
    if (error instanceof Response) return error;
    return serverError(error);
  }
}
