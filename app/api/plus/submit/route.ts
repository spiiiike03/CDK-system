import { NextRequest } from "next/server";
import { normalizeCdk } from "@/lib/cdk";
import { ensureSchema, sql } from "@/lib/db";
import { badRequest, clientIp, json, serverError } from "@/lib/http";
import { pixBackend, type PixBackendTask } from "@/lib/pix-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json().catch(() => ({}));
    const code = normalizeCdk(body.code ?? body.cdk ?? "");
    const at = extractAccessToken(body.at ?? body.access_token ?? body.accessToken ?? "");
    if (!code) {
      return badRequest("请输入 CDK");
    }
    if (at.length < 30) {
      return badRequest("请粘贴有效的 access token");
    }

    const orderRows = await sql`
      with selected_cdk as (
        select *
        from cdk_codes
        where upper(code) = upper(${code})
          and status = 'active'
          and used_count < max_uses
          and (expires_at is null or expires_at > now())
        for update
      ),
      pending_orders as (
        select selected_cdk.id as cdk_id,
               count(plus_orders.id)::int as pending_count
        from selected_cdk
        left join plus_orders
          on plus_orders.cdk_id = selected_cdk.id
         and plus_orders.status in ('processing', 'qr_ready', 'paid_waiting_subscription')
        group by selected_cdk.id
      ),
      eligible_cdk as (
        select selected_cdk.*
        from selected_cdk
        join pending_orders on pending_orders.cdk_id = selected_cdk.id
        where selected_cdk.used_count + pending_orders.pending_count < selected_cdk.max_uses
      ),
      inserted_order as (
        insert into plus_orders (cdk_id, cdk_code, status, ip)
        select id, code, 'processing', ${clientIp(request)}
        from eligible_cdk
        returning id, cdk_id, cdk_code, status, created_at
      )
      select * from inserted_order
    `;

    if (!orderRows.length) {
      return json({ ok: false, message: await submitFailureMessage(code) }, { status: 400 });
    }

    const order = orderRows[0];
    try {
      const task = await pixBackend<PixBackendTask>("/api/public/pix/create", {
        method: "POST",
        body: JSON.stringify({
          code: order.cdk_code,
          order_id: order.id,
          at,
        }),
      });
      await sql`
        update plus_orders
        set pix_task_id = ${task.task_id || null},
            pix_order_id = ${task.order_id || null},
            backend_status = ${task.status || null},
            updated_at = now()
        where id = ${order.id}
      `;
      return json({
        ok: true,
        order_id: order.id,
        display_id: displayId(order.id),
        code: order.cdk_code,
        status: "processing",
        pix_task_id: task.task_id || "",
        pix_order_id: task.order_id || "",
        server_now: Math.floor(Date.now() / 1000),
        message: "已提交，正在生成 Pix 二维码",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pix 后端提交失败";
      await sql`
        update plus_orders
        set status = 'failed',
            error = ${message},
            updated_at = now()
        where id = ${order.id}
      `;
      return json({ ok: false, order_id: order.id, status: "failed", message }, { status: 502 });
    }
  } catch (error) {
    return serverError(error);
  }
}

async function submitFailureMessage(code: string) {
  const rows = await sql`
    select status, max_uses, used_count, expires_at
    from cdk_codes
    where upper(code) = upper(${code})
    limit 1
  `;
  if (!rows.length) {
    return "CDK 不存在";
  }
  const cdk = rows[0];
  if (cdk.status !== "active") {
    return "CDK 不可用";
  }
  if (cdk.expires_at && new Date(cdk.expires_at).getTime() <= Date.now()) {
    return "CDK 已过期";
  }
  if (Number(cdk.used_count) >= Number(cdk.max_uses)) {
    return "CDK 次数已用完";
  }
  return "CDK 正在处理中，请稍后查询";
}

function displayId(id: string) {
  return `PLUS-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function extractAccessToken(value: unknown): string {
  if (value && typeof value === "object") {
    const nested = findAccessToken(value);
    if (nested) return unwrapBearer(stripWrappingQuotes(nested));
  }
  const text = stripWrappingQuotes(String(value ?? "").trim());
  if (!text) return "";
  const direct = unwrapBearer(text);
  const parsed = parseJsonLike(direct);
  const fromJson = parsed ? findAccessToken(parsed) : "";
  if (fromJson) return unwrapBearer(stripWrappingQuotes(fromJson));
  const match = direct.match(/["']?(?:accessToken|access_token)["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (match?.[1]) return unwrapBearer(stripWrappingQuotes(match[1]));
  return direct.length >= 30 && !/\s/.test(direct) ? direct : "";
}

function parseJsonLike(text: string): unknown {
  if (!text.startsWith("{") && !text.startsWith("[")) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findAccessToken(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const token = findAccessToken(item);
      if (token) return token;
    }
    return "";
  }
  const data = value as Record<string, unknown>;
  for (const key of ["accessToken", "access_token"]) {
    const token = data[key];
    if (typeof token === "string" && token.trim()) return token.trim();
  }
  for (const child of Object.values(data)) {
    const token = findAccessToken(child);
    if (token) return token;
  }
  return "";
}

function stripWrappingQuotes(value: string): string {
  const text = value.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function unwrapBearer(value: string): string {
  return value.trim().replace(/^bearer\s+/i, "").trim();
}
