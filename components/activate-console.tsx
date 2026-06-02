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
  status: "processing" | "qr_ready" | "paid" | "failed" | "expired";
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

export function ActivateConsole() {
  const [code, setCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [codeInfo, setCodeInfo] = useState<CodeInfo | null>(null);
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);

  const normalizedCode = useMemo(() => code.trim().toUpperCase(), [code]);
  const canSubmit = Boolean(codeInfo?.ok && accessToken.trim().length >= 30 && !loading);
  const qrUrl = order?.qr_png || order?.qr_svg || "";
  const pixCode = order?.pix_code || "";
  const isDone = order?.status === "paid" || order?.status === "failed" || order?.status === "expired";

  useEffect(() => {
    const storedOrder = window.localStorage.getItem(STORED_ORDER_KEY);
    if (storedOrder) {
      void refreshOrder(storedOrder, false);
    }
  }, []);

  useEffect(() => {
    if (!order?.order_id || isDone) return;
    const timer = window.setInterval(() => {
      void refreshOrder(order.order_id, false);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [order?.order_id, isDone]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
        at: accessToken.trim(),
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

  async function copyPixCode() {
    if (!pixCode) return;
    await navigator.clipboard.writeText(pixCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
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
                  placeholder='粘贴 access token，或 chatgpt.com/api/auth/session 返回 JSON 中的 accessToken'
                  value={accessToken}
                  onChange={(event) => setAccessToken(event.target.value)}
                />
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
              {order.expires_at && order.status !== "paid" ? <KeyValue label="剩余时间" value={remainingText(order.expires_at, tick)} /> : null}
            </div>

            {order.status === "paid" ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                <CheckCircle2 className="mx-auto text-emerald-600" size={42} />
                <div className="mt-3 text-lg font-bold text-emerald-800">ChatGPT Plus 已开通</div>
                <p className="m-0 mt-1 text-sm text-emerald-700">Pix 码已从前后端清理，CDK 已计数。</p>
              </div>
            ) : null}

            {order.status === "processing" ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center text-amber-800">
                <Loader2 className="mx-auto animate-spin" size={34} />
                <div className="mt-3 font-bold">正在生成 Pix 二维码</div>
                <p className="m-0 mt-1 text-sm">通常需要几十秒，请保持页面打开。</p>
              </div>
            ) : null}

            {order.status === "qr_ready" ? (
              <div className="mt-5 grid gap-4">
                {qrUrl ? (
                  <div className="mx-auto w-full max-w-[340px] rounded-xl border border-slate-200 bg-white p-3">
                    <img className="h-auto w-full" src={qrUrl} alt="Pix QR" />
                  </div>
                ) : null}
                {pixCode ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">Pix 码</label>
                    <div className="flex gap-2 max-[640px]:flex-col">
                      <div className="min-h-11 flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-xs text-white">
                        {pixCode}
                      </div>
                      <button className="button success min-w-[128px] rounded-xl" onClick={copyPixCode} type="button">
                        <Copy size={17} />
                        {copied ? "已复制" : "复制 Pix"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
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

function remainingText(expiresAt: number, tick: number) {
  void tick;
  const left = Math.max(0, Number(expiresAt || 0) - Math.floor(Date.now() / 1000));
  const minutes = String(Math.floor(left / 60)).padStart(2, "0");
  const seconds = String(left % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
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
