import { NextRequest } from "next/server";
import { getAdminFromRequest } from "@/lib/auth";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return json({ ok: false, message: "未登录" }, { status: 401 });
  }
  return json({ ok: true, admin });
}
