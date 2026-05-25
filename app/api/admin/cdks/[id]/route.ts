import { NextRequest } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { ensureSchema, sql } from "@/lib/db";
import { badRequest, json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertAdmin(request);
    await ensureSchema();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const status = String(body.status || "");
    if (!["active", "disabled"].includes(status)) {
      return badRequest("状态不合法");
    }
    const rows = await sql`
      update cdk_codes
      set status = ${status}
      where id = ${id} and status <> 'used'
      returning id, code, status
    `;
    if (!rows.length) {
      return badRequest("CDK 不存在或已使用", 404);
    }
    return json({ ok: true, item: rows[0] });
  } catch (error) {
    if (error instanceof Response) return error;
    return serverError(error);
  }
}
