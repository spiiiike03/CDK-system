"use client";

import { useState } from "react";
import { BadgeCheck, Download, KeyRound, ShieldCheck } from "lucide-react";

type RedeemResultItem = {
  ok: boolean;
  code: string;
  message?: string;
  filename?: string;
  deliveredCount?: number;
  payload?: unknown;
  files?: Array<{ id: string; name: string }>;
};

type RedeemResponse = {
  ok: boolean;
  message?: string;
  filename?: string;
  deliveredCount?: number;
  successCount?: number;
  failCount?: number;
  results?: RedeemResultItem[];
  payload?: unknown;
};

export function ActivateConsole() {
  const [cdkText, setCdkText] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [result, setResult] = useState<RedeemResponse | null>(null);

  const codes = parseCodes(cdkText);

  async function redeem() {
    setLoading(true);
    setNotice({ type: "info", message: "正在兑换 CDK，请稍候..." });
    setResult(null);
    try {
      const response = await fetch("/api/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cdks: codes }),
      });
      const data = await response.json();
      setResult(data);
      if (!response.ok || !data.ok) {
        setNotice({ type: "error", message: data.message || "兑换失败" });
        return;
      }
      setNotice({ type: "success", message: data.message || "兑换成功" });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "兑换失败" });
    } finally {
      setLoading(false);
    }
  }

  function downloadJson(payload: unknown, filename = "cdk-export.json") {
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
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
            <span>每行一个 CDK，可批量兑换并合并下载</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_360px] gap-5 max-[900px]:grid-cols-1">
        <section className="panel p-6">
          <div className="mb-6 flex items-start justify-between gap-4 max-[640px]:flex-col">
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-brand">CDK REDEEM</p>
              <h2 className="m-0 text-3xl font-bold text-ink max-[640px]:text-2xl">兑换 JSON 发放文件</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                支持多行输入，每行一个 CDK。系统会按每个 CDK 的后台配置发放对应数量的 JSON，并可整合成一个下载文件。
              </p>
            </div>
            <span className="status ok">自动锁库存</span>
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void redeem();
            }}
          >
            <textarea
              className="textarea mono min-h-[150px] text-[15px]"
              placeholder={"请输入 CDK，每行一个\nCDK-ABCD-2345-EFGH\nCDK-HJKL-6789-MNPQ"}
              value={cdkText}
              onChange={(event) => setCdkText(event.target.value)}
            />
            <div className="flex items-center justify-between gap-3 max-[640px]:flex-col max-[640px]:items-stretch">
              <span className="text-sm text-slate-600">已识别 {codes.length} 个 CDK，单次最多 50 个。</span>
              <button className="button primary min-w-[132px]" disabled={loading || !codes.length} type="submit">
                <ShieldCheck size={18} />
                {loading ? "兑换中" : "立即兑换"}
              </button>
            </div>
          </form>

          {notice ? <div className={`notice ${notice.type} mt-4`}>{notice.message}</div> : null}

          {result?.results?.length ? (
            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <BadgeCheck className="text-mint" size={24} />
                  <div>
                    <strong className="block text-ink">
                      成功 {result.successCount || 0} 个，失败 {result.failCount || 0} 个，发放 {result.deliveredCount || 0} 个 JSON
                    </strong>
                    <span className="text-sm text-slate-600">{result.filename || "cdk-export.json"}</span>
                  </div>
                </div>
                {result.payload ? (
                  <button
                    className="button success"
                    type="button"
                    onClick={() => downloadJson(result.payload, result.filename || "cdk-export.json")}
                  >
                    <Download size={18} />
                    合并下载全部 JSON
                  </button>
                ) : null}
              </div>

              <div className="mt-4 space-y-2">
                {result.results.map((item, index) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 max-[640px]:flex-col max-[640px]:items-stretch"
                    key={`${item.code}-${index}`}
                  >
                    <div>
                      <span className="mono text-sm font-bold text-ink">{item.code}</span>
                      <div className="mt-1 text-sm text-slate-600">
                        {item.ok
                          ? `已发放 ${item.deliveredCount || 0} 个 JSON`
                          : item.message || "兑换失败"}
                      </div>
                    </div>
                    {item.ok && item.payload ? (
                      <button
                        className="button"
                        type="button"
                        onClick={() => downloadJson(item.payload, item.filename || `${item.code}.json`)}
                      >
                        <Download size={16} />
                        下载该 CDK
                      </button>
                    ) : (
                      <span className="status err">失败</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="space-y-4">
          <div className="panel p-5">
            <h3 className="m-0 text-base font-bold text-ink">兑换说明</h3>
            <ul className="mt-3 space-y-2 pl-5 text-sm leading-6 text-slate-600">
              <li>每行输入一个 CDK，可一次兑换多个。</li>
              <li>每个 CDK 会按后台设置发放对应数量 JSON。</li>
              <li>可下载单个 CDK，也可合并下载全部成功结果。</li>
              <li>库存不足或已使用的 CDK 不会影响其他行继续兑换。</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}

function parseCodes(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
