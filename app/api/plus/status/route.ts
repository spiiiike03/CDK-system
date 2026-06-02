import { NextRequest } from "next/server";
import { normalizeCdk } from "@/lib/cdk";
import { ensureSchema, sql, type PlusOrderRow } from "@/lib/db";
import { badRequest, json, serverError } from "@/lib/http";
import { pixBackend, type PixBackendOrder, type PixBackendTask } from "@/lib/pix-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json().catch(() => ({}));
    const order = await findOrder(body);
    if (!order) {
      return json({ ok: false, message: "没有找到订单" }, { status: 404 });
    }
    const synced = await syncOrder(order);
    return json(publicOrder(synced.order, synced.backendOrder));
  } catch (error) {
    return serverError(error);
  }
}

async function findOrder(body: Record<string, unknown>): Promise<PlusOrderRow | null> {
  const orderId = String(body.order_id ?? body.orderId ?? "").trim();
  const code = normalizeCdk(body.code ?? body.cdk ?? "");
  if (!orderId && !code) {
    throw new Error("缺少订单号或 CDK");
  }
  const rows = orderId
    ? await sql`
        select *
        from plus_orders
        where id = ${orderId}
        limit 1
      `
    : await sql`
        select *
        from plus_orders
        where upper(cdk_code) = upper(${code})
        order by created_at desc
        limit 1
      `;
  return (rows[0] as PlusOrderRow | undefined) || null;
}

async function syncOrder(order: PlusOrderRow): Promise<{ order: PlusOrderRow; backendOrder?: PixBackendOrder }> {
  if (order.status === "paid" || order.status === "failed" || order.status === "expired") {
    return { order };
  }

  let backendOrder: PixBackendOrder | undefined;
  try {
    if (order.pix_order_id) {
      backendOrder = await pixBackend<PixBackendOrder>(`/api/public/pix/orders/${encodeURIComponent(order.pix_order_id)}/check`, {
        method: "POST",
      });
    } else if (order.pix_task_id) {
      const task = await pixBackend<PixBackendTask>(`/api/public/pix/tasks/${encodeURIComponent(order.pix_task_id)}`);
      backendOrder = task.order;
      if (task.order_id && task.order_id !== order.pix_order_id) {
        await sql`
          update plus_orders
          set pix_order_id = ${task.order_id},
              backend_status = ${task.status || null},
              updated_at = now()
          where id = ${order.id}
        `;
        order.pix_order_id = task.order_id;
      }
      if (task.status === "failed") {
        return { order: await markFailed(order.id, task.error || "Pix 生成失败") };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pix 后端状态查询失败";
    await sql`
      update plus_orders
      set backend_status = 'poll_error',
          error = ${message},
          updated_at = now()
      where id = ${order.id}
    `;
    return { order: { ...order, error: message } };
  }

  if (!backendOrder) {
    return { order };
  }

  if (backendOrder.status === "paid_confirmed" || backendOrder.payment_check?.confirmed) {
    const paid = await markPaid(order, backendOrder);
    return { order: paid, backendOrder };
  }

  if (backendOrder.status === "payment_received" || backendOrder.payment_check?.payment_received) {
    const waiting = await markPaymentReceived(order, backendOrder);
    return { order: waiting, backendOrder };
  }

  const summary = backendOrder.summary || {};
  if (summary.qr_png || summary.qr_svg || summary.pix_code) {
    const rows = await sql`
      update plus_orders
      set status = 'qr_ready',
          pix_order_id = ${backendOrder.order_id || order.pix_order_id},
          email = ${backendOrder.email || summary.email || order.email},
          backend_status = ${backendOrder.status || summary.final_status || null},
          expires_at = ${summary.expires_at ? new Date(Number(summary.expires_at) * 1000).toISOString() : order.expires_at},
          updated_at = now()
      where id = ${order.id}
      returning *
    `;
    return { order: rows[0] as PlusOrderRow, backendOrder };
  }

  return { order, backendOrder };
}

async function markPaid(order: PlusOrderRow, backendOrder: PixBackendOrder): Promise<PlusOrderRow> {
  const summary = backendOrder.summary || {};
  const rows = await sql`
    update plus_orders
    set status = 'paid',
        pix_order_id = ${backendOrder.order_id || order.pix_order_id},
        email = ${backendOrder.email || summary.email || order.email},
        backend_status = ${backendOrder.status || summary.final_status || 'paid_confirmed'},
        paid_at = coalesce(paid_at, now()),
        updated_at = now()
    where id = ${order.id}
      and status <> 'paid'
    returning *
  `;
  if (rows.length) {
    const paid = rows[0] as PlusOrderRow;
    await sql`
      update cdk_codes
      set used_count = used_count + 1,
          status = case when used_count + 1 >= max_uses then 'used' else status end,
          used_at = case when used_count + 1 >= max_uses then now() else used_at end
      where id = ${paid.cdk_id}
    `;
    return paid;
  }
  return order;
}

async function markPaymentReceived(order: PlusOrderRow, backendOrder: PixBackendOrder): Promise<PlusOrderRow> {
  const summary = backendOrder.summary || {};
  const rows = await sql`
    update plus_orders
    set status = 'paid_waiting_subscription',
        pix_order_id = ${backendOrder.order_id || order.pix_order_id},
        email = ${backendOrder.email || summary.email || order.email},
        backend_status = ${backendOrder.status || summary.final_status || 'payment_received'},
        paid_at = coalesce(paid_at, now()),
        updated_at = now()
    where id = ${order.id}
      and status <> 'paid'
    returning *
  `;
  return (rows[0] as PlusOrderRow | undefined) || order;
}

async function markFailed(orderId: string, message: string): Promise<PlusOrderRow> {
  const rows = await sql`
    update plus_orders
    set status = 'failed',
        error = ${message},
        updated_at = now()
    where id = ${orderId}
    returning *
  `;
  return rows[0] as PlusOrderRow;
}

function publicOrder(order: PlusOrderRow, backendOrder?: PixBackendOrder) {
  const summary = backendOrder?.summary || {};
  const status = order.status;
  return {
    ok: true,
    order_id: order.id,
    display_id: displayId(order.id),
    code: order.cdk_code,
    status,
    email: order.email || backendOrder?.email || summary.email || "",
    pix_order_id: order.pix_order_id || backendOrder?.order_id || "",
    payment_status: summary.payment_status || backendOrder?.status || order.backend_status || "",
    subscription_status: backendOrder?.payment_check?.subscription_status || "",
    qr_png: status === "paid" || status === "paid_waiting_subscription" ? "" : summary.qr_png || "",
    qr_svg: status === "paid" || status === "paid_waiting_subscription" ? "" : summary.qr_svg || "",
    pix_code: status === "paid" || status === "paid_waiting_subscription" ? "" : summary.pix_code || "",
    expires_at: summary.expires_at || (order.expires_at ? Math.floor(new Date(order.expires_at).getTime() / 1000) : 0),
    server_now: Math.floor(Date.now() / 1000),
    message: statusMessage(status),
    error: order.error || "",
  };
}

function displayId(id: string) {
  return `PLUS-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function statusMessage(status: string) {
  if (status === "paid") return "ChatGPT Plus 已开通";
  if (status === "paid_waiting_subscription") return "Pix 已付款，正在确认账号开通";
  if (status === "qr_ready") return "Pix 二维码已生成，请完成支付";
  if (status === "failed") return "开通失败";
  if (status === "expired") return "订单已过期";
  return "正在生成 Pix 二维码";
}
