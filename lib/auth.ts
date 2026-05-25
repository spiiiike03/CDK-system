import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "cdk_admin";
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 12;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET must be at least 16 characters");
  }
  return secret;
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createAdminToken(username: string, maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS) {
  const payload = {
    sub: username,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const body = base64Url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyAdminToken(token: string | undefined) {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      sub?: string;
      exp?: number;
    };
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { username: payload.sub };
  } catch {
    return null;
  }
}

export function getAdminFromRequest(request: NextRequest) {
  return verifyAdminToken(request.cookies.get(COOKIE_NAME)?.value);
}

export function adminCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEFAULT_MAX_AGE_SECONDS,
  };
}

export function clearAdminCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export function assertAdmin(request: NextRequest) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    throw new Response(JSON.stringify({ ok: false, message: "未登录或登录已过期" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return admin;
}
