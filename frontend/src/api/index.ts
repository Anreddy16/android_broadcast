// API client. Uses EXPO_PUBLIC_BACKEND_URL from .env.
import { storage } from "@/src/utils/storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!BASE_URL) {
  console.warn("EXPO_PUBLIC_BACKEND_URL is not set");
}

const TOKEN_KEY = "auth_token";

export async function getToken(): Promise<string | null> {
  return await storage.getItem<string>(TOKEN_KEY, "");
}

export async function setToken(token: string): Promise<void> {
  await storage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storage.removeItem(TOKEN_KEY);
}

type FetchOpts = { method?: string; body?: unknown; auth?: boolean };

async function request<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const url = `${BASE_URL}/api${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const t = await getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail =
      (data && typeof data === "object" && "detail" in (data as Record<string, unknown>) &&
        (data as { detail?: string }).detail) ||
      res.statusText;
    throw new Error(String(detail));
  }
  return data as T;
}

// --- Auth ---
export const api = {
  register: (email: string, password: string, name: string) =>
    request<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: { email, password, name },
      auth: false,
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    }),
  requestOtp: (email: string) =>
    request<{ mock_otp: string }>("/auth/otp/request", {
      method: "POST",
      body: { email },
      auth: false,
    }),
  verifyOtp: (email: string, otp: string) =>
    request<{ token: string; user: User }>("/auth/otp/verify", {
      method: "POST",
      body: { email, otp },
      auth: false,
    }),
  forgotPassword: (email: string) =>
    request<{ mock_reset_token: string }>("/auth/forgot-password", {
      method: "POST",
      body: { email },
      auth: false,
    }),
  resetPassword: (email: string, token: string, new_password: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: { email, token, new_password },
      auth: false,
    }),
  me: () => request<{ user: User }>("/auth/me"),

  // Wallet
  getWallet: () => request<{ balance: number; channel_price: number; currency: string }>("/wallet"),
  recharge: (amount: number) =>
    request<{ balance: number; transaction: Transaction }>("/wallet/recharge", {
      method: "POST",
      body: { amount },
    }),
  getTransactions: () => request<{ transactions: Transaction[] }>("/wallet/transactions"),

  // Channels
  createChannel: (payload: {
    name: string;
    category: string;
    language: string;
    description: string;
    logo_base64?: string | null;
  }) => request<{ channel: Channel; wallet_balance: number }>("/channels", { method: "POST", body: payload }),
  listChannels: () => request<{ channels: Channel[] }>("/channels"),
  getChannel: (id: string) => request<{ channel: Channel }>(`/channels/${id}`),
  renewChannel: (id: string) =>
    request<{ channel: Channel; wallet_balance: number }>(`/channels/${id}/renew`, { method: "POST" }),
  disableChannel: (id: string) => request<{ ok: boolean }>(`/channels/${id}/disable`, { method: "POST" }),
  enableChannel: (id: string) => request<{ ok: boolean }>(`/channels/${id}/enable`, { method: "POST" }),
  deleteChannel: (id: string) => request<{ ok: boolean }>(`/channels/${id}`, { method: "DELETE" }),
  monitorChannel: (id: string) => request<{ metrics: StreamMetrics; raw: unknown }>(`/channels/${id}/monitor`),

  // Dashboard
  getDashboard: () => request<DashboardData>("/dashboard"),

  // Notifications
  listNotifications: () => request<{ notifications: Notification[] }>("/notifications"),
  markAllRead: () => request<{ ok: boolean }>("/notifications/read-all", { method: "POST" }),

  // Admin
  adminOverview: () => request<AdminOverview>("/admin/overview"),
  adminUsers: () => request<{ users: User[] }>("/admin/users"),
  adminChannels: () => request<{ channels: Channel[] }>("/admin/channels"),
  adminAdjustWallet: (user_id: string, amount: number, reason: string) =>
    request<{ user_id: string; new_balance: number }>("/admin/wallet/adjust", {
      method: "POST",
      body: { user_id, amount, reason },
    }),
  adminDeleteChannel: (id: string) => request<{ ok: boolean }>(`/admin/channels/${id}`, { method: "DELETE" }),
  adminDisableChannel: (id: string) => request<{ ok: boolean }>(`/admin/channels/${id}/disable`, { method: "POST" }),
  adminExpireNow: () => request<{ ok: boolean }>("/admin/expire-now", { method: "POST" }),
};

// --- Types ---
export type User = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  wallet_balance: number;
  created_at?: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  amount: number;
  type: "credit" | "debit";
  reason: string;
  balance_after: number;
  created_at: string;
};

export type Channel = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  language: string;
  description: string;
  logo_base64?: string | null;
  stream_name: string;
  status: "active" | "expired" | "disabled";
  flussonic_provisioned: boolean;
  flussonic_error?: string | null;
  publish: {
    rtmp_publish_url: string;
    rtmp_backup_url: string;
    stream_key: string;
    srt_publish_url: string;
  };
  playback: Record<string, string>;
  created_at: string;
  expires_at: string;
  updated_at: string;
  remaining_days: number;
};

export type StreamMetrics = {
  alive: boolean;
  bitrate_in: number;
  bitrate_out: number;
  resolution: string;
  fps: number;
  audio_codec: string;
  video_codec: string;
  viewers: number;
  uptime_seconds: number;
  bandwidth_bytes: number;
};

export type DashboardData = {
  wallet_balance: number;
  channel_price: number;
  active_channels: number;
  expired_channels: number;
  disabled_channels: number;
  total_channels: number;
  monthly_charges: number;
  recent_transactions: Transaction[];
  recent_notifications: Notification[];
};

export type Notification = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  kind: string;
  read: boolean;
  created_at: string;
};

export type AdminOverview = {
  users: number;
  total_channels: number;
  active_channels: number;
  expired_channels: number;
  revenue: number;
  total_recharges: number;
};
