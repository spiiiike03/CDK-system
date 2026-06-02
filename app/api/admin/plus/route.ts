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

    const [stats] = await sql`
      select
        (select count(*)::int from plus_orders) as total_orders,
        (select count(*)::int from plus_orders where status = 'processing') as processing_orders,
        (select count(*)::int from plus_orders where status = 'qr_ready') as qr_ready_orders,
        (select count(*)::int from plus_orders where status = 'paid_waiting_subscription') as paid_waiting_subscription_orders,
        (select count(*)::int from plus_orders where status = 'paid') as paid_orders,
        (select count(*)::int from plus_orders where status = 'failed') as failed_orders,
        (select count(*)::int from plus_orders where status = 'expired') as expired_orders,
        (select count(*)::int from plus_orders where status = 'paid' and paid_at >= date_trunc('day', now())) as today_paid_orders,
        (select count(*)::int from cdk_codes where upper(code) like 'BX-%') as total_recharge_cdks,
        (select count(*)::int from cdk_codes where upper(code) like 'BX-%' and status = 'active') as active_recharge_cdks
    `;

    const orders = await sql`
      select id,
             cdk_code,
             status,
             pix_task_id,
             pix_order_id,
             email,
             backend_status,
             error,
             ip,
             created_at,
             updated_at,
             paid_at,
             expires_at
      from plus_orders
      order by created_at desc
      limit 200
    `;

    const cdks = await sql`
      select id, code, status, file_count, max_uses, used_count, expires_at, used_at, created_at
      from cdk_codes
      where upper(code) like 'BX-%'
      order by created_at desc
      limit 200
    `;

    return json({ ok: true, stats, orders, cdks });
  } catch (error) {
    if (error instanceof Response) return error;
    return serverError(error);
  }
}
