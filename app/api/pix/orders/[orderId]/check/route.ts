import { NextRequest } from "next/server";
import { json, serverError } from "@/lib/http";
import { pixBackend, type PixBackendOrder } from "@/lib/pix-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await context.params;
    const order = await pixBackend<PixBackendOrder>(`/api/public/pix/orders/${encodeURIComponent(orderId)}/check`, {
      method: "POST",
    });
    return json({ ok: true, status: order.status || "", order_id: order.order_id || orderId });
  } catch (error) {
    return serverError(error);
  }
}
