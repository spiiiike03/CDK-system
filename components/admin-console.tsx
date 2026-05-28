"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Boxes,
  ClipboardCopy,
  Database,
  FileJson,
  History,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Upload,
} from "lucide-react";

type Tab = "overview" | "files" | "cdks" | "records";

type Stats = {
  available_files: number;
  delivered_files: number;
  disabled_files: number;
  total_cdks: number;
  active_cdks: number;
  redeem_records: number;
};

type CdkItem = {
  id: string;
  code: string;
  status: "active" | "used" | "disabled";
  file_count: number;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  created_at: string;
};

type FileItem = {
  id: string;
  original_name: string;
  status: "available" | "delivered" | "disabled";
  imported_at: string;
  delivered_at: string | null;
};

type RecordItem = {
  id: string;
  cdk_code: string;
  delivered_count: number;
  ip: string | null;
  created_at: string;
};

const navItems: Array<{ id: Tab; label: string; Icon: typeof Database }> = [
  { id: "overview", label: "总览", Icon: Database },
  { id: "files", label: "JSON 库存", Icon: FileJson },
  { id: "cdks", label: "CDK 管理", Icon: KeyRound },
  { id: "records", label: "兑换记录", Icon: History },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.href = "/admin/login";
    throw new Error("未登录");
  }
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || "请求失败");
  }
  return data as T;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === "active" || status === "available") return "ok";
  if (status === "disabled") return "err";
  return "warn";
}

function statusText(status: string) {
  const map: Record<string, string> = {
    active: "启用",
    used: "已使用",
    disabled: "禁用",
    available: "可用",
    delivered: "已发放",
  };
  return map[status] || status;
}

export function AdminConsole() {
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cdks, setCdks] = useState<CdkItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [records, setRecords] = useState<RecordItem[]>([]);

  const [quantity, setQuantity] = useState(10);
  const [fileCount, setFileCount] = useState(1);
  const [maxUses, setMaxUses] = useState(1);
  const [prefix, setPrefix] = useState("CDK");
  const [expiresAt, setExpiresAt] = useState("");
  const [newCodes, setNewCodes] = useState<string[]>([]);

  const cards = useMemo(() => ([
    { label: "可用 JSON", value: stats?.available_files ?? 0, icon: FileJson },
    { label: "已发放 JSON", value: stats?.delivered_files ?? 0, icon: Boxes },
    { label: "启用 CDK", value: stats?.active_cdks ?? 0, icon: KeyRound },
    { label: "兑换记录", value: stats?.redeem_records ?? 0, icon: History },
  ]), [stats]);

  async function refresh() {
    setLoading(true);
    setMessage(null);
    try {
      const [nextStats, nextCdks, nextFiles, nextRecords] = await Promise.all([
        api<{ stats: Stats }>("/api/admin/stats"),
        api<{ items: CdkItem[] }>("/api/admin/cdks"),
        api<{ items: FileItem[] }>("/api/admin/files"),
        api<{ items: RecordItem[] }>("/api/admin/records"),
      ]);
      setStats(nextStats.stats);
      setCdks(nextCdks.items);
      setFiles(nextFiles.items);
      setRecords(nextRecords.items);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "加载失败" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  async function importFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setMessage({ type: "info", text: "正在解析并导入账号 JSON..." });
    try {
      const items = await Promise.all(Array.from(fileList).map(async (file) => {
        const text = await file.text();
        return { name: file.name, text };
      }));
      const result = await api<{ imported: number }>("/api/admin/import", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      setMessage({ type: "success", text: `已导入 ${result.imported} 个账号 JSON` });
      await refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "导入失败，请确认文件是合法 JSON/JSONL/TXT" });
    }
  }

  async function generateCodes() {
    setMessage({ type: "info", text: "正在生成 CDK..." });
    setNewCodes([]);
    try {
      const result = await api<{ codes: string[] }>("/api/admin/cdks", {
        method: "POST",
        body: JSON.stringify({ quantity, fileCount, maxUses, prefix, expiresAt }),
      });
      setNewCodes(result.codes);
      setMessage({ type: "success", text: `已生成 ${result.codes.length} 个 CDK` });
      await refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "生成失败" });
    }
  }

  async function updateCdk(id: string, status: "active" | "disabled") {
    try {
      await api(`/api/admin/cdks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "操作失败" });
    }
  }

  function copyCodes(codes: string[]) {
    void navigator.clipboard.writeText(codes.join("\n"));
    setMessage({ type: "success", text: "CDK 已复制" });
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Database size={22} /></div>
          <div>
            <h1>JSON 分发管理后台</h1>
            <span>管理库存、CDK 和兑换记录</span>
          </div>
        </div>
        <div className="flex gap-2">
          <a className="button" href="/activate">返回兑换页</a>
          <button className="button" type="button" onClick={() => void refresh()}>
            <RefreshCw size={17} />
            刷新
          </button>
          <button className="button danger" type="button" onClick={() => void logout()}>
            <LogOut size={17} />
            退出
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1180px] grid-cols-[210px_minmax(0,1fr)] gap-5 max-[900px]:grid-cols-1">
        <aside className="panel p-3">
          <nav className="grid gap-2">
            {navItems.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`button justify-start ${tab === id ? "primary" : ""}`}
                type="button"
                onClick={() => setTab(id)}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="space-y-5">
          {message ? <div className={`notice ${message.type}`}>{message.text}</div> : null}
          {loading ? <div className="notice info">正在加载后台数据...</div> : null}

          {tab === "overview" ? (
            <div className="space-y-5">
              <div className="grid grid-cols-4 gap-4 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
                {cards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div className="panel p-5" key={card.label}>
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-600">{card.label}</span>
                        <Icon size={20} className="text-brand" />
                      </div>
                      <strong className="text-3xl text-ink">{card.value}</strong>
                    </div>
                  );
                })}
              </div>
              <ImportPanel onImport={importFiles} />
              <GeneratePanel
                expiresAt={expiresAt}
                fileCount={fileCount}
                maxUses={maxUses}
                newCodes={newCodes}
                prefix={prefix}
                quantity={quantity}
                onCopy={copyCodes}
                onGenerate={generateCodes}
                setExpiresAt={setExpiresAt}
                setFileCount={setFileCount}
                setMaxUses={setMaxUses}
                setPrefix={setPrefix}
                setQuantity={setQuantity}
              />
            </div>
          ) : null}

          {tab === "files" ? <FilesTable items={files} /> : null}
          {tab === "cdks" ? (
            <div className="space-y-5">
              <GeneratePanel
                expiresAt={expiresAt}
                fileCount={fileCount}
                maxUses={maxUses}
                newCodes={newCodes}
                prefix={prefix}
                quantity={quantity}
                onCopy={copyCodes}
                onGenerate={generateCodes}
                setExpiresAt={setExpiresAt}
                setFileCount={setFileCount}
                setMaxUses={setMaxUses}
                setPrefix={setPrefix}
                setQuantity={setQuantity}
              />
              <CdksTable items={cdks} onCopy={copyCodes} onUpdate={updateCdk} />
            </div>
          ) : null}
          {tab === "records" ? <RecordsTable items={records} /> : null}
        </section>
      </main>
    </div>
  );
}

function ImportPanel({ onImport }: { onImport: (files: FileList | null) => void }) {
  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center gap-2 font-bold text-ink">
        <Upload size={18} />
        导入账号 JSON
      </div>
      <input
        className="input h-auto py-2"
        multiple
        accept="application/json,application/x-ndjson,text/plain,.json,.jsonl,.txt"
        type="file"
        onChange={(event) => void onImport(event.target.files)}
      />
    </div>
  );
}

type GeneratePanelProps = {
  quantity: number;
  fileCount: number;
  maxUses: number;
  prefix: string;
  expiresAt: string;
  newCodes: string[];
  setQuantity: (value: number) => void;
  setFileCount: (value: number) => void;
  setMaxUses: (value: number) => void;
  setPrefix: (value: string) => void;
  setExpiresAt: (value: string) => void;
  onGenerate: () => Promise<void>;
  onCopy: (codes: string[]) => void;
};

function GeneratePanel(props: GeneratePanelProps) {
  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center gap-2 font-bold text-ink">
        <Plus size={18} />
        生成 CDK
      </div>
      <div className="grid grid-cols-5 gap-3 max-[920px]:grid-cols-2 max-[560px]:grid-cols-1">
        <Field label="生成数量">
          <input className="input" min={1} max={200} type="number" value={props.quantity} onChange={(event) => props.setQuantity(Number(event.target.value))} />
        </Field>
        <Field label="每次发放 JSON">
          <input className="input" min={1} max={100} type="number" value={props.fileCount} onChange={(event) => props.setFileCount(Number(event.target.value))} />
        </Field>
        <Field label="可使用次数">
          <input className="input" min={1} max={100} type="number" value={props.maxUses} onChange={(event) => props.setMaxUses(Number(event.target.value))} />
        </Field>
        <Field label="前缀">
          <input className="input mono" value={props.prefix} onChange={(event) => props.setPrefix(event.target.value)} />
        </Field>
        <Field label="过期时间">
          <input className="input" type="datetime-local" value={props.expiresAt} onChange={(event) => props.setExpiresAt(event.target.value)} />
        </Field>
      </div>
      <button className="button primary mt-4" type="button" onClick={() => void props.onGenerate()}>
        <Plus size={17} />
        生成
      </button>
      {props.newCodes.length ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">新生成 CDK</span>
            <button className="button" type="button" onClick={() => props.onCopy(props.newCodes)}>
              <ClipboardCopy size={16} />
              复制
            </button>
          </div>
          <textarea className="textarea mono" readOnly value={props.newCodes.join("\n")} />
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function FilesTable({ items }: { items: FileItem[] }) {
  return (
    <div className="panel p-5">
      <h2 className="mb-4 mt-0 text-lg font-bold text-ink">JSON 库存</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>文件名</th><th>状态</th><th>导入时间</th><th>发放时间</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.original_name}</td>
                <td><span className={`status ${statusClass(item.status)}`}>{statusText(item.status)}</span></td>
                <td>{formatDate(item.imported_at)}</td>
                <td>{formatDate(item.delivered_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CdksTable({
  items,
  onCopy,
  onUpdate,
}: {
  items: CdkItem[];
  onCopy: (codes: string[]) => void;
  onUpdate: (id: string, status: "active" | "disabled") => Promise<void>;
}) {
  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="m-0 text-lg font-bold text-ink">CDK 列表</h2>
        <button className="button" type="button" onClick={() => onCopy(items.map((item) => item.code))}>
          <ClipboardCopy size={16} />
          复制全部
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>CDK</th><th>状态</th><th>发放数</th><th>使用</th><th>过期</th><th>操作</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.code}</td>
                <td><span className={`status ${statusClass(item.status)}`}>{statusText(item.status)}</span></td>
                <td>{item.file_count}</td>
                <td>{item.used_count}/{item.max_uses}</td>
                <td>{formatDate(item.expires_at)}</td>
                <td>
                  {item.status === "used" ? "-" : (
                    <button
                      className={`button ${item.status === "active" ? "danger" : "success"}`}
                      type="button"
                      onClick={() => void onUpdate(item.id, item.status === "active" ? "disabled" : "active")}
                    >
                      {item.status === "active" ? "禁用" : "启用"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecordsTable({ items }: { items: RecordItem[] }) {
  return (
    <div className="panel p-5">
      <h2 className="mb-4 mt-0 text-lg font-bold text-ink">兑换记录</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>记录</th><th>CDK</th><th>发放数量</th><th>IP</th><th>时间</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.id.slice(0, 8)}</td>
                <td className="mono">{item.cdk_code}</td>
                <td>{item.delivered_count}</td>
                <td>{item.ip || "-"}</td>
                <td>{formatDate(item.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
