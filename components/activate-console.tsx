"use client";

import { useState } from "react";
import { BadgeCheck, Download, KeyRound, Search, ShieldCheck } from "lucide-react";

type ActionMode = "redeem" | "query";

type ResultItem = {
  ok: boolean;
  code: string;
  message?: string;
  filename?: string;
  deliveredCount?: number;
  payload?: unknown;
  files?: Array<{ id: string; name: string }>;
};

type ActionResponse = {
  ok: boolean;
  message?: string;
  filename?: string;
  deliveredCount?: number;
  successCount?: number;
  failCount?: number;
  results?: ResultItem[];
  payload?: unknown;
};

export function ActivateConsole() {
  const [mode, setMode] = useState<ActionMode>("redeem");
  const [cdkText, setCdkText] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [result, setResult] = useState<ActionResponse | null>(null);

  const codes = parseCodes(cdkText);
  const isQuery = mode === "query";

  async function submit() {
    setLoading(true);
    setNotice({ type: "info", message: isQuery ? "正在查询 CDK，请稍候..." : "正在兑换 CDK，请稍候..." });
    setResult(null);
    try {
      const response = await fetch(isQuery ? "/api/query" : "/api/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cdks: codes }),
      });
      const data = await response.json();
      setResult(data);
      if (!response.ok || !data.ok) {
        setNotice({ type: "error", message: data.message || (isQuery ? "查询失败" : "兑换失败") });
        return;
      }
      setNotice({ type: "success", message: data.message || (isQuery ? "查询成功" : "兑换成功") });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : (isQuery ? "查询失败" : "兑换失败") });
    } finally {
      setLoading(false);
    }
  }

  function downloadJson(payload: unknown, filename = "cdk-export.json") {
    if (!payload) return;
    const isTextPayload = typeof payload === "string";
    const blob = new Blob([isTextPayload ? payload : JSON.stringify(payload, null, 2)], {
      type: isTextPayload ? "text/plain;charset=utf-8" : "application/json;charset=utf-8",
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
            <span>每行一个 CDK，可批量兑换、查询并合并下载</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_360px] gap-5 max-[900px]:grid-cols-1">
        <section className="panel p-6">
          <div className="mb-6 flex items-start justify-between gap-4 max-[640px]:flex-col">
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-brand">CDK REDEEM</p>
              <h2 className="m-0 text-3xl font-bold text-ink max-[640px]:text-2xl">兑换 / 查询 JSON 文件</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                兑换会消耗可用 CDK 并发放库存 JSON；查询不会消耗库存，可用已兑换 CDK 找回当时发放的 JSON，下载内容和兑换时一致。
              </p>
            </div>
            <span className="status ok">自动锁库存</span>
          </div>

          <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              className={`button border-0 ${mode === "redeem" ? "primary" : ""}`}
              type="button"
              onClick={() => {
                setMode("redeem");
                setNotice(null);
                setResult(null);
              }}
            >
              <ShieldCheck size={17} />
              CDK 兑换
            </button>
            <button
              className={`button border-0 ${mode === "query" ? "primary" : ""}`}
              type="button"
              onClick={() => {
                setMode("query");
                setNotice(null);
                setResult(null);
              }}
            >
              <Search size={17} />
              CDK 查询
            </button>
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <textarea
              className="textarea mono min-h-[150px] text-[15px]"
              placeholder={isQuery
                ? "请输入已兑换 CDK，每行一个\nCDK-ABCD-2345-EFGH\nCDK-HJKL-6789-MNPQ"
                : "请输入 CDK，每行一个\nCDK-ABCD-2345-EFGH\nCDK-HJKL-6789-MNPQ"}
              value={cdkText}
              onChange={(event) => setCdkText(event.target.value)}
            />
            <div className="flex items-center justify-between gap-3 max-[640px]:flex-col max-[640px]:items-stretch">
              <span className="text-sm text-slate-600">已识别 {codes.length} 个 CDK。</span>
              <button className="button primary min-w-[132px]" disabled={loading || !codes.length} type="submit">
                {isQuery ? <Search size={18} /> : <ShieldCheck size={18} />}
                {loading ? (isQuery ? "查询中" : "兑换中") : (isQuery ? "立即查询" : "立即兑换")}
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
                      成功 {result.successCount || 0} 个，失败 {result.failCount || 0} 个，文件 {result.deliveredCount || 0} 个
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
                    合并下载全部账号
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
                          ? `文件 ${item.deliveredCount || 0} 个`
                          : item.message || (isQuery ? "查询失败" : "兑换失败")}
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
            <h3 className="m-0 text-base font-bold text-ink">使用说明</h3>
            <ul className="mt-3 space-y-2 pl-5 text-sm leading-6 text-slate-600">
              <li>兑换：每行输入一个可用 CDK，按后台设置发放 JSON。</li>
              <li>查询：每行输入一个已兑换 CDK，可找回已发放 JSON。</li>
              <li>查询不会再次消耗 CDK，也不会改动库存。</li>
              <li>可下载单个 CDK，也可合并下载全部成功结果。</li>
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
