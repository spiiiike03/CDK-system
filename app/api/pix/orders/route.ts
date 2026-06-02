import { NextRequest } from "next/server";
import { json, serverError } from "@/lib/http";
import { pixBackend, type PixBackendOrder } from "@/lib/pix-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublicPixOrder = {
  order_id: string;
  display_id: string;
  status: string;
  product: string;
  code: string;
  public_order_id: string;
  qr_png: string;
  qr_svg: string;
  pix_code: string;
  expires_at: number;
  created_at: number;
  updated_at: number;
  paid_at: number;
};

export async function GET(request: NextRequest) {
  try {
    const limit = Math.min(500, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 200)));
    const data = await pixBackend<{ items: PixBackendOrder[] }>(`/api/public/pix/orders?limit=${limit}`);
    const now = Math.floor(Date.now() / 1000);
    const allOrders = (data.items || []).map(publicOrder);
    const visibleOrders = allOrders.filter((order) => (
      order.status !== "paid_confirmed"
      && (order.qr_png || order.qr_svg || order.pix_code)
      && order.expires_at > now
    ));
    const todayStart = Math.floor(new Date(new Date().toDateString()).getTime() / 1000);

    return json({
      ok: true,
      server_now: now,
      stats: {
        pending: visibleOrders.length,
        paid_total: allOrders.filter((order) => order.status === "paid_confirmed").length,
        paid_today: allOrders.filter((order) => order.status === "paid_confirmed" && order.paid_at >= todayStart).length,
      },
      items: visibleOrders,
    });
  } catch (error) {
    return serverError(error);
  }
}

function publicOrder(order: PixBackendOrder): PublicPixOrder {
  const summary = order.summary || {};
  const publicMeta = (order.public || {}) as Record<string, unknown>;
  const orderId = String(order.order_id || summary.order_id || summary.task_id || "");
  const createdAt = Number((order as { created_at?: number }).created_at || 0);
  return {
    order_id: orderId,
    display_id: `PAY-${orderId.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase()}`,
    status: String(order.status || summary.final_status || ""),
    product: "ChatGPT Plus - 1 month",
    code: String(publicMeta.code || ""),
    public_order_id: String(publicMeta.order_id || ""),
    qr_png: String(summary.qr_png || ""),
    qr_svg: String(summary.qr_svg || ""),
    pix_code: String(summary.pix_code || ""),
    expires_at: Number(summary.expires_at || 0),
    created_at: createdAt,
    updated_at: Number((order as { updated_at?: number }).updated_at || 0),
    paid_at: Number(order.paid_at || 0),
  };
}
