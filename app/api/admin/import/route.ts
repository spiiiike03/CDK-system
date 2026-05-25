import { NextRequest } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { ensureSchema, sql } from "@/lib/db";
import { badRequest, json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportItem = {
  name?: string;
  content?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    assertAdmin(request);
    await ensureSchema();
    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items as ImportItem[] : [];
    if (!items.length) {
      return badRequest("没有可导入的 JSON 文件");
    }
    if (items.length > 500) {
      return badRequest("单次最多导入 500 个 JSON");
    }

    let imported = 0;
    for (const item of items) {
      const name = String(item.name || `json-${Date.now()}-${imported + 1}.json`).slice(0, 180);
      if (item.content === null || typeof item.content === "undefined") {
        continue;
      }
      await sql`
        insert into json_files (original_name, content)
        values (${name}, ${JSON.stringify(item.content)}::jsonb)
      `;
      imported += 1;
    }

    return json({ ok: true, imported });
  } catch (error) {
    if (error instanceof Response) return error;
    return serverError(error);
  }
}
