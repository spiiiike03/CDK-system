import { NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearAdminCookie());
  return response;
}
