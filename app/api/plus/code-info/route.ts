import { NextRequest } from "next/server";
import { normalizeCdk } from "@/lib/cdk";
import { ensureSchema, sql } from "@/lib/db";
import { badRequest, json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json().catch(() => ({}));
    const code = normalizeCdk(body.code ?? body.cdk ?? "");
    if (!code) {
      return badRequest("请输入 CDK");
    }

    const rows = await sql`
      select c.id,
             c.code,
             c.status,
             c.max_uses,
             c.used_count,
             c.expires_at,
             (
               select count(*)::int
               from plus_orders p
               where p.cdk_id = c.id
                 and p.status in ('processing', 'qr_ready', 'paid_waiting_subscription')
             ) as pending_count
      from cdk_codes c
      where upper(c.code) = upper(${code})
      limit 1
    `;

    if (!rows.length) {
      return json({ ok: false, message: "CDK 不存在" }, { status: 404 });
    }

    const cdk = rows[0];
    const total = Number(cdk.max_uses || 0);
    const used = Number(cdk.used_count || 0);
    const pending = Number(cdk.pending_count || 0);
    const expired = cdk.expires_at ? new Date(cdk.expires_at).getTime() <= Date.now() : false;
    const remaining = Math.max(0, total - used - pending);

    if (cdk.status !== "active") {
      return json({ ok: false, code: cdk.code, total, used, pending, remaining: 0, message: "CDK 不可用" }, { status: 400 });
    }
    if (expired) {
      return json({ ok: false, code: cdk.code, total, used, pending, remaining: 0, message: "CDK 已过期" }, { status: 400 });
    }
    if (remaining <= 0) {
      return json({ ok: false, code: cdk.code, total, used, pending, remaining: 0, message: "CDK 次数已用完或正在处理中" }, { status: 400 });
    }

    return json({
      ok: true,
      code: cdk.code,
      total,
      used,
      pending,
      remaining,
      message: `CDK 有效，剩余 ${remaining} 次`,
    });
  } catch (error) {
    return serverError(error);
  }
}
