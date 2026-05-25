"use client";

import { useState } from "react";
import { KeyRound, LogIn } from "lucide-react";

export function LoginForm() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function login() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "登录失败");
      }
      window.location.href = "/admin";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell grid place-items-center">
      <main className="panel w-full max-w-[420px] p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="brand-mark"><KeyRound size={22} /></div>
          <div>
            <h1 className="m-0 text-xl font-bold text-ink">管理后台登录</h1>
            <p className="m-0 mt-1 text-sm text-slate-600">使用 Vercel 环境变量中的管理员账号</p>
          </div>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void login();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">用户名</span>
            <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">密码</span>
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {message ? <div className="notice error">{message}</div> : null}
          <button className="button primary w-full" disabled={loading} type="submit">
            <LogIn size={18} />
            {loading ? "登录中" : "登录"}
          </button>
        </form>
      </main>
    </div>
  );
}
