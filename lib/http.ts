import { NextResponse } from "next/server";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function badRequest(message: string, status = 400) {
  return json({ ok: false, message }, { status });
}

export function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : "服务器错误";
  return json({ ok: false, message }, { status: 500 });
}

export function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || ""
  );
}
