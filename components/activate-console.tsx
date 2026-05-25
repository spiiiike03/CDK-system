"use client";

import { useState } from "react";
import { BadgeCheck, Download, KeyRound, ShieldCheck, Users } from "lucide-react";

type RedeemResponse = {
  ok: boolean;
  message?: string;
  filename?: string;
  deliveredCount?: number;
  payload?: unknown;
};

export function ActivateConsole() {
  const [cdk, setCdk] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [result, setResult] = useState<RedeemResponse | null>(null);

  async function redeem() {
    setLoading(true);
    setNotice({ type: "info", message: "正在兑换 CDK，请稍候..." });
    setResult(null);
    try {
      const response = await fetch("/api/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cdk }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "兑换失败");
      }
      setResult(data);
      setNotice({ type: "success", message: data.message || "兑换成功" });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "兑换失败" });
    } finally {
      setLoading(false);
    }
  }

  function downloadJson() {
    if (!result?.payload) return;
    const blob = new Blob([JSON.stringify(result.payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename || "cdk-export.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><KeyRound size={22} /></div>
          <div>
            <h1>JSON 文件兑换</h1>
            <span>输入 CDK 后自动发放库存 JSON</span>
          </div>
        </div>
        <a className="button" href="/admin">管理后台</a>
      </header>

      <main className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_360px] gap-5 max-[900px]:grid-cols-1">
        <section className="panel p-6">
          <div className="mb-6 flex items-start justify-between gap-4 max-[640px]:flex-col">
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-brand">CDK REDEEM</p>
              <h2 className="m-0 text-3xl font-bold text-ink max-[640px]:text-2xl">兑换 JSON 发放文件</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                兑换成功后会立即生成下载文件。每个 CDK 按后台设置发放指定数量的 JSON，已发放库存不会重复使用。
              </p>
            </div>
            <span className="status ok">自动锁库存</span>
          </div>

          <form
            className="grid grid-cols-[1fr_auto] gap-3 max-[640px]:grid-cols-1"
            onSubmit={(event) => {
              event.preventDefault();
              void redeem();
            }}
          >
            <input
              className="input mono text-[15px]"
              placeholder="请输入 CDK，例如 CDK-ABCD-2345-EFGH"
              value={cdk}
              onChange={(event) => setCdk(event.target.value)}
            />
            <button className="button primary min-w-[132px]" disabled={loading || !cdk.trim()} type="submit">
              <ShieldCheck size={18} />
              {loading ? "兑换中" : "立即兑换"}
            </button>
          </form>

          {notice ? <div className={`notice ${notice.type} mt-4`}>{notice.message}</div> : null}

          {result?.payload ? (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-3">
                <BadgeCheck className="text-mint" size={24} />
                <div>
                  <strong className="block text-ink">已发放 {result.deliveredCount || 1} 个 JSON</strong>
                  <span className="text-sm text-slate-600">{result.filename}</span>
                </div>
              </div>
              <button className="button success mt-4" type="button" onClick={downloadJson}>
                <Download size={18} />
                下载 JSON
              </button>
            </div>
          ) : null}
        </section>

        <aside className="space-y-4">
          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2 font-bold text-ink">
              <Users size={18} />
              联系方式
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <a className="block hover:text-brand" href="https://qm.qq.com/q/GmN6NYIh6c" target="_blank" rel="noreferrer">
                售后 QQ 群：1072653807
              </a>
              <a className="block hover:text-brand" href="https://qm.qq.com/q/Bz7bx904XQ" target="_blank" rel="noreferrer">
                合作联系 QQ：191176548
              </a>
            </div>
          </div>

          <div className="panel p-5">
            <h3 className="m-0 text-base font-bold text-ink">兑换说明</h3>
            <ul className="mt-3 space-y-2 pl-5 text-sm leading-6 text-slate-600">
              <li>CDK 只能按后台设置的次数使用。</li>
              <li>库存不足时不会消耗 CDK。</li>
              <li>下载后请自行保存 JSON 文件。</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
