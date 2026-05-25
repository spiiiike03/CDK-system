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
      select id, original_name, status, imported_at, delivered_at, delivered_cdk_id
      from json_files
      order by imported_at desc
      limit 200
    `;
    return json({ ok: true, items: rows });
  } catch (error) {
    if (error instanceof Response) return error;
    return serverError(error);
  }
}
