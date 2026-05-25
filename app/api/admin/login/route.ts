import { NextRequest, NextResponse } from "next/server";
import { adminCookie, createAdminToken } from "@/lib/auth";
import { badRequest, json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const expectedUsername = process.env.ADMIN_USERNAME || "admin";
    const expectedPassword = process.env.ADMIN_PASSWORD || "";

    if (!expectedPassword) {
      return badRequest("请先在 Vercel 配置 ADMIN_PASSWORD", 500);
    }
    if (username !== expectedUsername || password !== expectedPassword) {
      return badRequest("用户名或密码错误", 401);
    }

    const response = NextResponse.json({ ok: true, username });
    response.cookies.set(adminCookie(createAdminToken(username)));
    return response;
  } catch (error) {
    return serverError(error);
  }
}
