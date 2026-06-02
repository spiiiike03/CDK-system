export type PixBackendTask = {
  ok: boolean;
  task_id: string;
  status: string;
  order_id?: string;
  order?: PixBackendOrder;
  error?: string;
};

export type PixBackendOrder = {
  order_id: string;
  status: string;
  email?: string;
  paid_at?: number;
  external?: boolean;
  public?: Record<string, unknown>;
  payment_check?: {
    confirmed?: boolean;
    subscription_status?: string;
  };
  summary?: {
    order_id?: string;
    task_id?: string;
    email?: string;
    final_status?: string;
    payment_status?: string;
    pix_code?: string;
    qr_png?: string;
    qr_svg?: string;
    expires_at?: number;
    setup_intent?: string;
  };
};

export async function pixBackend<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.PIX_BACKEND_URL?.replace(/\/+$/, "");
  const token = process.env.PIX_BACKEND_TOKEN;
  if (!base || !token) {
    throw new Error("PIX_BACKEND_URL and PIX_BACKEND_TOKEN are required");
  }

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(data?.detail || data?.message || data?.error || `Pix backend error ${response.status}`);
    throw new Error(message);
  }
  return data as T;
}
