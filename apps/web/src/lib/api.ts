export type RolePermissions = Record<
  string,
  { read?: boolean; write?: boolean; delete?: boolean }
>;

export type AuthUser = {
  id: string;
  email: string;
  twoFaEnabled: boolean;
  role: {
    id: string;
    name: string;
    require2fa: boolean;
    permissions: RolePermissions;
  };
};

export type AuthResponse =
  | { status: "authenticated"; user: AuthUser }
  | { status: "2fa_required" }
  | { status: "2fa_setup_required" };

export type TotpSetup = {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const baseUrl = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!baseUrl) {
    throw new ApiError(
      0,
      "VITE_API_URL belum diatur. Periksa konfigurasi .env lalu jalankan ulang web.",
    );
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Respons tanpa JSON ditangani lewat status di bawah.
  }

  if (!response.ok) {
    const body = payload as { error?: { message?: string; code?: string } } | null;
    throw new ApiError(
      response.status,
      body?.error?.message ?? "Permintaan gagal. Coba lagi.",
      body?.error?.code,
    );
  }

  return payload as T;
}

export const api = {
  me: () => request<{ user: AuthUser }>("/auth/me"),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: { email, password } }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  setup2fa: () => request<{ setup: TotpSetup }>("/auth/2fa/setup", { method: "POST" }),
  verifySetup2fa: (code: string) =>
    request<AuthResponse>("/auth/2fa/setup/verify", { method: "POST", body: { code } }),
  verify2fa: (code: string) =>
    request<AuthResponse>("/auth/2fa/verify", { method: "POST", body: { code } }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Terjadi kesalahan. Coba lagi.";
}
