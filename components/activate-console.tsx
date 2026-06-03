"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, KeyRound, Loader2, QrCode, RefreshCw, Search, ShieldCheck } from "lucide-react";

type CodeInfo = {
  ok: boolean;
  code?: string;
  total?: number;
  used?: number;
  pending?: number;
  remaining?: number;
  message?: string;
};

type OrderStatus = {
  ok: boolean;
  order_id: string;
  display_id: string;
  code: string;
  status: "processing" | "qr_ready" | "paid_waiting_subscription" | "paid" | "failed" | "expired";
  email?: string;
  payment_status?: string;
  subscription_status?: string;
  qr_png?: string;
  qr_svg?: string;
  pix_code?: string;
  expires_at?: number;
  server_now?: number;
  message?: string;
  error?: string;
};

type Notice = { type: "success" | "error" | "info"; message: string } | null;

const STORED_ORDER_KEY = "plus_order_id";
const SESSION_URL = "https://chatgpt.com/api/auth/session";

export function ActivateConsole() {
  const [code, setCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [codeInfo, setCodeInfo] = useState<CodeInfo | null>(null);
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sessionLinkCopied, setSessionLinkCopied] = useState(false);

  const normalizedCode = useMemo(() => code.trim().toUpperCase(), [code]);
  const extractedAccessToken = useMemo(() => extractAccessTokenInput(accessToken), [accessToken]);
  const canSubmit = Boolean(codeInfo?.ok && extractedAccessToken.length >= 30 && !loading);
  const isDone = order?.status === "paid" || order?.status === "failed" || order?.status === "expired";

  useEffect(() => {
    const storedOrder = window.localStorage.getItem(STORED_ORDER_KEY);
    if (storedOrder) {
      void refreshOrder(storedOrder, false);
    }
  }, []);

  useEffect(() => {
    if (!order?.order_id || isDone) return;
    const interval = order.status === "paid_waiting_subscription" ? 2500 : order.status === "processing" ? 3000 : 5000;
    const timer = window.setInterval(() => {
      void refreshOrder(order.order_id, false);
    }, interval);
    return () => window.clearInterval(timer);
  }, [order?.order_id, order?.status, isDone]);

  async function verifyCode() {
    setLoading(true);
    setNotice({ type: "info", message: "正在验证 CDK..." });
    setCodeInfo(null);
    setOrder(null);
    try {
      const data = await postJson<CodeInfo>("/api/plus/code-info", { code: normalizedCode });
      setCodeInfo(data);
      if (!data.ok) {
        setNotice({ type: "error", message: data.message || "CDK 不可用" });
        return;
      }
      setCode(data.code || normalizedCode);
      setNotice({ type: "success", message: data.message || "CDK 有效" });
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error, "验证失败") });
    } finally {
      setLoading(false);
    }
  }

  async function submitOrder() {
    setLoading(true);
    setNotice({ type: "info", message: "已提交，正在生成 Pix 二维码..." });
    try {
      const data = await postJson<OrderStatus>("/api/plus/submit", {
        code: normalizedCode,
        at: extractedAccessToken,
      });
      window.localStorage.setItem(STORED_ORDER_KEY, data.order_id);
      setOrder(data);
      setNotice({ type: "info", message: data.message || "正在生成 Pix 二维码" });
      void refreshOrder(data.order_id, false);
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error, "提交失败") });
    } finally {
      setLoading(false);
    }
  }

  async function refreshOrder(orderId = order?.order_id || "", manual = true) {
    if (!orderId) return;
    if (manual) setChecking(true);
    try {
      const data = await postJson<OrderStatus>("/api/plus/status", { order_id: orderId });
      setOrder(data);
      if (data.status === "paid") {
        setNotice({ type: "success", message: data.message || "ChatGPT Plus 已开通" });
        window.localStorage.removeItem(STORED_ORDER_KEY);
      } else if (data.status === "failed" || data.status === "expired") {
        setNotice({ type: "error", message: data.error || data.message || "订单未完成" });
      } else if (manual) {
        setNotice({ type: "info", message: data.message || "状态已刷新" });
      }
    } catch (error) {
      if (manual) setNotice({ type: "error", message: errorMessage(error, "刷新失败") });
    } finally {
      if (manual) setChecking(false);
    }
  }

  async function queryByCode() {
    if (!normalizedCode) {
      setNotice({ type: "error", message: "请输入 CDK" });
      return;
    }
    setChecking(true);
    try {
      const data = await postJson<OrderStatus>("/api/plus/status", { code: normalizedCode });
      setOrder(data);
      window.localStorage.setItem(STORED_ORDER_KEY, data.order_id);
      setNotice({ type: "info", message: data.message || "已找到最近订单" });
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error, "没有找到订单") });
    } finally {
      setChecking(false);
    }
  }

  async function copySessionUrl() {
    await navigator.clipboard.writeText(SESSION_URL);
    setSessionLinkCopied(true);
    window.setTimeout(() => setSessionLinkCopied(false), 1400);
  }

  function resetFlow() {
    setAccessToken("");
    setCodeInfo(null);
    setOrder(null);
    setNotice(null);
    window.localStorage.removeItem(STORED_ORDER_KEY);
  }

  return (
    <main className="min-h-screen bg-[#f6f8fa] px-4 py-6 text-[#1f2937]">
      <div className="mx-auto max-w-[760px]">
        <header className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#10a37f] text-white shadow-lg shadow-emerald-500/25">
            <KeyRound size={23} />
          </div>
          <div className="min-w-0">
            <h1 className="m-0 text-xl font-bold">ChatGPT Plus 卡密开通</h1>
            <p className="m-0 mt-1 text-sm text-slate-500">输入 CDK 和 access token，生成 Pix 支付码后完成开通。</p>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <StepBar status={order?.status} codeOk={Boolean(codeInfo?.ok)} />

          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">第一步 · CDK</label>
              <div className="flex gap-2 max-[560px]:flex-col">
                <input
                  className="input h-12 flex-1 rounded-xl text-center font-mono text-lg font-bold uppercase"
                  placeholder="BX-XXXXXXXX"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.toUpperCase());
                    setCodeInfo(null);
                    setNotice(null);
                  }}
                />
                <button className="button primary h-12 min-w-[108px] rounded-xl" disabled={loading || !normalizedCode} onClick={verifyCode} type="button">
                  {loading && !codeInfo ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                  验证
                </button>
              </div>
              {codeInfo?.ok ? (
                <p className="mt-2 text-sm font-medium text-emerald-700">
                  CDK 有效，剩余 {codeInfo.remaining} / {codeInfo.total} 次
                  {codeInfo.pending ? `，处理中 ${codeInfo.pending} 单` : ""}
                </p>
              ) : null}
            </div>

            {codeInfo?.ok ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">第二步 · access token</label>
                <textarea
                  className="textarea min-h-[122px] rounded-xl font-mono text-sm"
                  placeholder="可粘贴整段 session JSON，或只粘贴 accessToken"
                  value={accessToken}
                  onChange={(event) => setAccessToken(event.target.value)}
                />
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 max-[640px]:flex-col max-[640px]:items-stretch">
                  <div className="min-w-0 flex-1">
                    打开 <span className="font-mono text-slate-900">{SESSION_URL}</span>，可整段复制返回 JSON，系统会自动提取 <span className="font-mono text-slate-900">accessToken</span>
                  </div>
                  <button className="button h-9 shrink-0 rounded-lg px-3" onClick={copySessionUrl} type="button">
                    <Copy size={16} />
                    {sessionLinkCopied ? "已复制" : "复制地址"}
                  </button>
                </div>
                {accessToken.trim() ? (
                  <p className={`mt-2 text-sm font-medium ${extractedAccessToken ? "text-emerald-700" : "text-red-600"}`}>
                    {extractedAccessToken ? "已识别 accessToken，可直接开通" : "未识别到 accessToken，请检查粘贴内容"}
                  </p>
                ) : null}
                <button className="button success mt-3 h-12 w-full rounded-xl text-base" disabled={!canSubmit} onClick={submitOrder} type="button">
                  {loading && codeInfo ? <Loader2 className="animate-spin" size={19} /> : <QrCode size={19} />}
                  开通 Plus
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="button rounded-xl" disabled={checking || !normalizedCode} onClick={queryByCode} type="button">
              <Search size={17} />
              查询订单
            </button>
            {order ? (
              <button className="button rounded-xl" disabled={checking} onClick={() => refreshOrder(order.order_id)} type="button">
                {checking ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />}
                刷新状态
              </button>
            ) : null}
            {order?.status === "paid" || order?.status === "failed" || order?.status === "expired" ? (
              <button className="button rounded-xl" onClick={resetFlow} type="button">再开通一个</button>
            ) : null}
          </div>

          {notice ? <div className={`notice ${notice.type} mt-4`}>{notice.message}</div> : null}
        </section>

        {order ? (
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="m-0 text-lg font-bold">订单状态</h2>
                <p className="m-0 mt-1 font-mono text-sm text-slate-500">{order.display_id}</p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            <div className="grid gap-2 text-sm">
              <KeyValue label="CDK" value={order.code} />
              <KeyValue label="账号" value={order.email || "-"} />
              <KeyValue label="订单状态" value={order.message || order.status} />
            </div>

            <OrderProgress order={order} />

          </section>
        ) : null}
      </div>
    </main>
  );
}

function OrderProgress({ order }: { order: OrderStatus }) {
  const info = progressInfo(order.status);
  const failed = order.status === "failed" || order.status === "expired";
  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm text-slate-500">当前进度</div>
          <div className="mt-1 text-base font-bold text-slate-900">{info.title}</div>
        </div>
        <div className={`rounded-full px-3 py-1 text-sm font-bold ${failed ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
          {info.percent}%
        </div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all ${failed ? "bg-red-500" : "bg-emerald-500"}`}
          style={{ width: `${info.percent}%` }}
        />
      </div>
      <p className="m-0 mt-3 text-sm text-slate-600">{info.description}</p>
      {order.status !== "paid" && order.status !== "failed" && order.status !== "expired" ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          预计 10 分钟完成，请耐心等候
        </div>
      ) : null}
      <div className="mt-4 grid gap-2">
        {progressSteps(order.status).map((step) => (
          <div key={step.label} className="flex items-start gap-3 rounded-lg bg-white px-3 py-2">
            <div className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${step.done ? "bg-emerald-500 text-white" : step.active ? "bg-amber-400 text-white" : "bg-slate-200 text-slate-500"}`}>
              {step.done ? <CheckCircle2 size={15} /> : step.active ? <Loader2 className="animate-spin" size={14} /> : <span className="h-2 w-2 rounded-full bg-current" />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800">{step.label}</div>
              <div className="text-xs text-slate-500">{step.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function progressInfo(status: OrderStatus["status"]) {
  const map: Record<OrderStatus["status"], { percent: number; title: string; description: string }> = {
    processing: {
      percent: 25,
      title: "正在生成 Pix 支付任务",
      description: "后端正在创建 Stripe Pix 订单，支付码会出现在独立 Pix 展示页。",
    },
    qr_ready: {
      percent: 50,
      title: "Pix 已生成，等待支付",
      description: "支付由后端和 Pix 展示页处理；此页面只跟踪 CDK 开通进度。",
    },
    paid_waiting_subscription: {
      percent: 80,
      title: "已付款，正在确认账号开通",
      description: "后端正在使用提交的 accessToken 查询账号订阅状态，确认 Plus 后才算完成。",
    },
    paid: {
      percent: 100,
      title: "ChatGPT Plus 已开通",
      description: "账号侧已确认 Plus，CDK 兑换完成并计数。",
    },
    failed: {
      percent: 100,
      title: "开通失败",
      description: "订单未完成，请查看错误信息或重新提交。",
    },
    expired: {
      percent: 100,
      title: "订单已过期",
      description: "该 Pix 订单已过期，需要重新发起开通。",
    },
  };
  return map[status];
}

function progressSteps(status: OrderStatus["status"]) {
  const rank: Record<OrderStatus["status"], number> = {
    processing: 1,
    qr_ready: 2,
    paid_waiting_subscription: 3,
    paid: 4,
    failed: 4,
    expired: 4,
  };
  const current = rank[status];
  const steps = [
    ["提交任务", "CDK 和 accessToken 已提交到后端"],
    ["生成 Pix", "后端创建 Pix 支付订单"],
    ["等待支付", "支付在 Pix 展示页完成"],
    ["确认开通", "后端确认账号已变为 Plus"],
  ] as const;
  return steps.map(([label, description], index) => {
    const step = index + 1;
    return {
      label,
      description,
      done: status === "paid" ? true : step < current,
      active: status !== "paid" && status !== "failed" && status !== "expired" && step === current,
    };
  });
}

function StepBar({ codeOk, status }: { codeOk: boolean; status?: OrderStatus["status"] }) {
  const submitted = Boolean(status);
  const paid = status === "paid";
  return (
    <div className="mb-5 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-500">
      <div className={stepClass(codeOk || submitted)}>
        <span>1</span>
        验证 CDK
      </div>
      <div className={stepClass(submitted)}>
        <span>2</span>
        生成 Pix
      </div>
      <div className={stepClass(paid)}>
        <span>3</span>
        完成开通
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: OrderStatus["status"] }) {
  if (status === "paid") return <span className="status ok">已开通</span>;
  if (status === "paid_waiting_subscription") return <span className="status warn">已付款待确认</span>;
  if (status === "failed" || status === "expired") return <span className="status err">未完成</span>;
  return <span className="status warn">{status === "qr_ready" ? "待支付" : "处理中"}</span>;
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-slate-200 py-2 last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <strong className="text-right text-slate-800">{value}</strong>
    </div>
  );
}

function stepClass(active: boolean) {
  return `rounded-xl border px-3 py-2 ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50"}`;
}

function extractAccessTokenInput(value: string) {
  const text = value.trim();
  if (!text) return "";
  const unwrapped = unwrapBearer(stripWrappingQuotes(text));
  const json = parseJsonLike(unwrapped);
  const fromJson = json ? findTokenValue(json) : "";
  if (fromJson) return unwrapBearer(stripWrappingQuotes(fromJson));
  const match = unwrapped.match(/["']?(?:accessToken|access_token)["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (match?.[1]) return unwrapBearer(stripWrappingQuotes(match[1]));
  return unwrapped.length >= 30 && !/\s/.test(unwrapped) ? unwrapped : "";
}

function parseJsonLike(text: string): unknown {
  if (!text.startsWith("{") && !text.startsWith("[")) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findTokenValue(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const token = findTokenValue(item);
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
    const token = findTokenValue(child);
    if (token) return token;
  }
  return "";
}

function stripWrappingQuotes(value: string) {
  const text = value.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function unwrapBearer(value: string) {
  return value.trim().replace(/^bearer\s+/i, "").trim();
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(String(data?.message || data?.error || "请求失败"));
  }
  return data as T;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
