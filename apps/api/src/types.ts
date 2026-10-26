import type { RolePermissions } from "./lib/permissions.ts";

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

export type AppEnv = {
  Variables: {
    user: AuthUser;
    sessionId: string;
  };
};
