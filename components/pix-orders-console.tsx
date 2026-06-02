"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Grid2X2, List, QrCode, RefreshCw } from "lucide-react";

type ViewMode = "qr" | "pix";

type PixOrder = {
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

type PixOrdersResponse = {
  ok: boolean;
  server_now: number;
  stats: {
    pending: number;
    paid_total: number;
    paid_today: number;
  };
  items: PixOrder[];
};

const PAGE_SIZE = 12;

export function PixOrdersConsole() {
  const [orders, setOrders] = useState<PixOrder[]>([]);
  const [stats, setStats] = useState<PixOrdersResponse["stats"]>({ pending: 0, paid_total: 0, paid_today: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>("qr");
  const [page, setPage] = useState(1);
  const [serverNow, setServerNow] = useState(Math.floor(Date.now() / 1000));
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const visibleOrders = useMemo(() => {
    const start = (Math.min(page, totalPages) - 1) * PAGE_SIZE;
    return orders.slice(start, start + PAGE_SIZE);
  }, [orders, page, totalPages]);

  async function loadOrders(nextChecking = false) {
    setError("");
    if (!nextChecking) setLoading(true);
    try {
      const response = await fetch("/api/pix/orders?limit=500", { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as PixOrdersResponse & { message?: string };
      if (!response.ok || data.ok === false) {
        throw new Error(data.message || "加载失败");
      }
      setOrders(data.items || []);
      setStats(data.stats || { pending: 0, paid_total: 0, paid_today: 0 });
      setServerNow(data.server_now || Math.floor(Date.now() / 1000));
      setPage((current) => Math.min(Math.max(1, current), Math.max(1, Math.ceil((data.items || []).length / PAGE_SIZE))));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function checkVisibleOrders() {
    if (checking || !visibleOrders.length) return;
    setChecking(true);
    try {
      await Promise.allSettled(visibleOrders.map((order) => (
        fetch(`/api/pix/orders/${encodeURIComponent(order.order_id)}/check`, { method: "POST" })
      )));
      await loadOrders(true);
    } finally {
      setChecking(false);
    }
  }

  async function copyPix(order: PixOrder) {
    if (!order.pix_code) return;
    await navigator.clipboard.writeText(order.pix_code);
    setCopied(order.order_id);
    window.setTimeout(() => setCopied(""), 1400);
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setServerNow((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void loadOrders(true), 6000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void checkVisibleOrders(), 18000);
    return () => window.clearInterval(timer);
  }, [visibleOrders, checking]);

  return (
    <main className="min-h-screen bg-[#090d13] px-4 py-5 text-slate-100">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-4 border-b border-slate-800 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-2xl font-bold">待支付订单</h1>
            <div className="min-w-[260px] flex-1 rounded-lg border border-slate-800 bg-[#121a26] px-4 py-2 text-center text-sm">
              今日开通 <b className="text-emerald-400">{stats.paid_today}</b>
              <span className="mx-4 text-slate-600">|</span>
              累计开通 <b className="text-emerald-400">{stats.paid_total}</b>
              <span className="mx-4 text-slate-600">|</span>
              待支付 <b className="text-amber-300">{stats.pending}</b>
            </div>
            <button className="control-button" type="button" onClick={() => setViewMode(viewMode === "qr" ? "pix" : "qr")}>
              {viewMode === "qr" ? <List size={18} /> : <Grid2X2 size={18} />}
              {viewMode === "qr" ? "显示 Pix 码" : "显示二维码"}
            </button>
            <button className="control-button" type="button" disabled={loading || checking} onClick={() => void checkVisibleOrders()}>
              <RefreshCw className={checking ? "animate-spin" : ""} size={18} />
              刷新
            </button>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
          <span>第 {Math.min(page, totalPages)} / {totalPages} 页，{orders.length} orders</span>
          <div className="flex gap-2">
            <button className="control-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              <ChevronLeft size={18} />
              上一页
            </button>
            <button className="control-button" type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
              下一页
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {error ? <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-red-100">{error}</div> : null}
        {loading ? <div className="rounded-lg border border-slate-800 bg-[#121a26] px-4 py-3 text-slate-300">正在加载订单...</div> : null}
        {!loading && !visibleOrders.length ? <EmptyState /> : null}

        {viewMode === "qr" && visibleOrders.length ? (
          <div className="grid grid-cols-4 gap-5 max-[1200px]:grid-cols-3 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
            {visibleOrders.map((order) => <QrCard key={order.order_id} now={serverNow} order={order} />)}
          </div>
        ) : null}

        {viewMode === "pix" && visibleOrders.length ? (
          <div className="grid gap-3">
            {visibleOrders.map((order) => (
              <PixCodeRow
                copied={copied === order.order_id}
                key={order.order_id}
                now={serverNow}
                onCopy={() => void copyPix(order)}
                order={order}
              />
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function QrCard({ order, now }: { order: PixOrder; now: number }) {
  const qrSrc = order.qr_png || order.qr_svg;
  return (
    <article className="rounded-lg border border-slate-800 bg-[#121a26] p-2">
      <div className="grid aspect-square place-items-center rounded-md bg-white p-3">
        {qrSrc ? (
          <img alt={order.display_id} className="h-full w-full object-contain" src={qrSrc} />
        ) : (
          <QrCode className="text-slate-300" size={96} />
        )}
      </div>
      <div className="px-2 py-3 text-center">
        <div className="mx-auto mb-1 inline-flex rounded bg-slate-800 px-2 py-1 font-mono text-xs text-slate-300">{order.display_id}</div>
        <div className="text-sm text-sky-100">
          剩余时间 <b className="rounded bg-amber-300/20 px-1 font-mono text-amber-300">{remaining(order.expires_at, now)}</b>
        </div>
      </div>
    </article>
  );
}

function PixCodeRow({
  copied,
  now,
  onCopy,
  order,
}: {
  copied: boolean;
  now: number;
  onCopy: () => void;
  order: PixOrder;
}) {
  return (
    <article className="rounded-lg border border-slate-800 bg-[#121a26] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="rounded bg-slate-800 px-2 py-1 font-mono text-xs text-slate-300">{order.display_id}</span>
        <h2 className="m-0 text-lg font-bold">{order.product}</h2>
      </div>
      <div className="mb-3 text-sm text-sky-100">
        剩余时间 <b className="rounded bg-amber-300/20 px-1 font-mono text-amber-300">{remaining(order.expires_at, now)}</b>
        <span className="mx-2 text-slate-600">|</span>
        待支付
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_118px] gap-2 max-[700px]:grid-cols-1">
        <div className="overflow-hidden rounded-md border border-slate-800 bg-[#080c12] px-3 py-3 font-mono text-sm text-slate-50">
          <div className="truncate">{order.pix_code || "-"}</div>
        </div>
        <button className="copy-button" type="button" disabled={!order.pix_code} onClick={onCopy}>
          <Copy size={17} />
          {copied ? "已复制" : "复制 Pix 码"}
        </button>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-slate-800 bg-[#121a26] px-5 py-10 text-center text-slate-300">
      暂无待支付订单
    </div>
  );
}

function remaining(expiresAt: number, now: number) {
  if (!expiresAt) return "--:--";
  const seconds = Math.max(0, expiresAt - now);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
