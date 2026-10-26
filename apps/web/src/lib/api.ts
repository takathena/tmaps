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

export type DeviceType = {
  id: string;
  name: string;
  category: string;
  requiresIp: boolean;
  icon: string;
  createdAt: string;
  updatedAt: string;
};

export type DeviceModel = {
  id: string;
  deviceTypeId: string;
  vendor: string;
  modelName: string;
  portCapacity: number | null;
  ponCapacity: number | null;
  productUrl: string | null;
  referenceImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CableType = {
  id: string;
  vendor: string;
  modelName: string;
  color: string;
  coreCapacity: number;
  productUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeviceTypeInput = {
  name: string;
  category: string;
  requiresIp: boolean;
  icon: string;
};

export type DeviceModelInput = {
  deviceTypeId: string;
  vendor: string;
  modelName: string;
  portCapacity: number | null;
  ponCapacity: number | null;
  productUrl: string | null;
  referenceImageUrl: string | null;
};

export type CableTypeInput = {
  vendor: string;
  modelName: string;
  color: string;
  coreCapacity: number;
  productUrl: string | null;
};

export type DeviceStatus = "active" | "offline" | "unmonitored";

export type DeviceSummary = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: DeviceStatus;
  deviceTypeId: string;
  typeName: string;
  icon: string;
};

export type DeviceMonitoringConfig = {
  enabled: boolean;
  intervalSeconds: number;
};

export type DeviceDetail = {
  id: string;
  name: string;
  deviceModelId: string;
  ipAddress: string | null;
  latitude: number;
  longitude: number;
  parentId: string | null;
  portUsed: number;
  description: string | null;
  status: DeviceStatus;
  installedAt: string;
  createdAt: string;
  updatedAt: string;
  deviceModel: {
    id: string;
    vendor: string;
    modelName: string;
    portCapacity: number | null;
    ponCapacity: number | null;
    productUrl: string | null;
    referenceImageUrl: string | null;
  };
  deviceType: {
    id: string;
    name: string;
    category: string;
    requiresIp: boolean;
    icon: string;
  };
  monitoring: DeviceMonitoringConfig | null;
};

export type DeviceCreateInput = {
  name: string;
  deviceModelId: string;
  ipAddress?: string | null;
  latitude: number;
  longitude: number;
  parentId?: string | null;
  portUsed?: number;
  description?: string | null;
  status?: DeviceStatus;
  installedAt?: string;
  monitoring?: DeviceMonitoringConfig;
};

export type DeviceUpdateInput = Partial<DeviceCreateInput>;

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

  getDeviceTypes: () => request<{ deviceTypes: DeviceType[] }>("/catalog/device-types"),
  createDeviceType: (body: DeviceTypeInput) =>
    request<{ deviceType: DeviceType }>("/catalog/device-types", { method: "POST", body }),
  updateDeviceType: (id: string, body: Partial<DeviceTypeInput>) =>
    request<{ deviceType: DeviceType }>(`/catalog/device-types/${id}`, {
      method: "PATCH",
      body,
    }),
  deleteDeviceType: (id: string) =>
    request<void>(`/catalog/device-types/${id}`, { method: "DELETE" }),

  getDeviceModels: (deviceTypeId?: string) => {
    const query = deviceTypeId
      ? `?${new URLSearchParams({ deviceTypeId }).toString()}`
      : "";
    return request<{ deviceModels: DeviceModel[] }>(`/catalog/device-models${query}`);
  },
  createDeviceModel: (body: DeviceModelInput) =>
    request<{ deviceModel: DeviceModel }>("/catalog/device-models", { method: "POST", body }),
  updateDeviceModel: (id: string, body: Partial<DeviceModelInput>) =>
    request<{ deviceModel: DeviceModel }>(`/catalog/device-models/${id}`, {
      method: "PATCH",
      body,
    }),
  deleteDeviceModel: (id: string) =>
    request<void>(`/catalog/device-models/${id}`, { method: "DELETE" }),

  getCableTypes: () => request<{ cableTypes: CableType[] }>("/catalog/cable-types"),
  createCableType: (body: CableTypeInput) =>
    request<{ cableType: CableType }>("/catalog/cable-types", { method: "POST", body }),
  updateCableType: (id: string, body: Partial<CableTypeInput>) =>
    request<{ cableType: CableType }>(`/catalog/cable-types/${id}`, {
      method: "PATCH",
      body,
    }),
  deleteCableType: (id: string) =>
    request<void>(`/catalog/cable-types/${id}`, { method: "DELETE" }),

  getDevices: () => request<{ devices: DeviceSummary[] }>("/devices"),
  getDevice: (id: string) => request<{ device: DeviceDetail }>(`/devices/${id}`),
  createDevice: (body: DeviceCreateInput) =>
    request<{ device: DeviceDetail }>("/devices", { method: "POST", body }),
  updateDevice: (id: string, body: DeviceUpdateInput) =>
    request<{ device: DeviceDetail }>(`/devices/${id}`, { method: "PATCH", body }),
  deleteDevice: (id: string) => request<void>(`/devices/${id}`, { method: "DELETE" }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Terjadi kesalahan. Coba lagi.";
}
