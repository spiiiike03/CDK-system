import { NextRequest } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { generateCdk, normalizePrefix } from "@/lib/cdk";
import { ensureSchema, sql } from "@/lib/db";
import { badRequest, json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertAdmin(request);
    await ensureSchema();

    const body = await request.json().catch(() => ({}));
    const quantity = Math.min(200, Math.max(1, Math.floor(Number(body.quantity) || 1)));
    const maxUses = Math.min(100, Math.max(1, Math.floor(Number(body.maxUses) || 1)));
    const prefix = normalizePrefix(body.prefix || "BX");
    const expiresAt = String(body.expiresAt || "").trim() || null;
    const created: string[] = [];

    for (let index = 0; index < quantity; index += 1) {
      let inserted = false;
      for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
        const code = generateCdk(prefix);
        const rows = await sql`
          insert into cdk_codes (code, file_count, max_uses, expires_at)
          values (${code}, 1, ${maxUses}, ${expiresAt})
          on conflict (code) do nothing
          returning code
        `;
        if (rows[0]?.code) {
          created.push(rows[0].code);
          inserted = true;
        }
      }
    }

    if (!created.length) {
      return badRequest("生成失败，请重试", 500);
    }

    return json({ ok: true, codes: created });
  } catch (error) {
    if (error instanceof Response) return error;
    return serverError(error);
  }
}
