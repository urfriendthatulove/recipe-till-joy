import { setSupabaseAppSessionToken, supabase } from "./supabase";

export type AppRole = "admin" | "user";

export interface AuthUser {
  id: string;
  username: string;
  displayName?: string;
  role: AppRole;
  sessionToken: string;
  authMode?: "rpc" | "legacy";
}

type AppSessionRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  role: AppRole;
  session_token: string;
};

type LegacyUserRow = {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
};

export type AppPermission =
  | "materials.manage"
  | "menus.manage"
  | "sales.create"
  | "sales.void"
  | "reports.view";

const STORAGE_KEY = "quinos-pos-auth-user";

let currentUser: AuthUser | null = null;

const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  admin: ["materials.manage", "menus.manage", "sales.create", "sales.void", "reports.view"],
  user: ["sales.create"],
};

function asErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function mapRowToAuthUser(row: AppSessionRow): AuthUser {
  return {
    id: row.user_id,
    username: row.username,
    displayName: row.display_name ?? undefined,
    role: normalizeRole(row.role),
    sessionToken: row.session_token,
    authMode: "rpc",
  };
}

function normalizeRole(role: string): AppRole {
  const value = role.trim().toLowerCase();
  return value === "admin" ? "admin" : "user";
}

function isRpcMissingError(err: unknown) {
  const msg = asErrorMessage(err, "").toLowerCase();
  return msg.includes("app_login") && (msg.includes("could not find") || msg.includes("function"));
}

async function signInLegacy(username: string, password: string) {
  if (!supabase) throw new Error("Supabase belum aktif.");

  const { data, error } = await supabase
    .from("app_users")
    .select("id, username, display_name, role, is_active")
    .eq("username", username)
    .eq("password", password)
    .maybeSingle<LegacyUserRow>();

  if (error) {
    throw new Error(
      "Mode login lama gagal. Jalankan ulang supabase-schema.sql terbaru agar login aman (hash + RPC) aktif.",
    );
  }

  if (!data) {
    throw new Error("Username atau password salah.");
  }

  if (!data.is_active) {
    throw new Error("Akun ini tidak aktif. Hubungi admin.");
  }

  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name ?? undefined,
    role: normalizeRole(data.role),
    sessionToken: "legacy-session",
    authMode: "legacy",
  } as AuthUser;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function persistUser(user: AuthUser | null) {
  if (!canUseStorage()) return;

  if (!user) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function readUserFromStorage(): AuthUser | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (!parsed.id || !parsed.username || (parsed.role !== "admin" && parsed.role !== "user")) {
      return null;
    }
    if (!parsed.sessionToken || typeof parsed.sessionToken !== "string") {
      return null;
    }
    return {
      id: parsed.id,
      username: parsed.username,
      displayName: parsed.displayName,
      role: parsed.role,
      sessionToken: parsed.sessionToken,
      authMode: parsed.authMode === "legacy" ? "legacy" : "rpc",
    };
  } catch {
    return null;
  }
}

export async function signInWithCredentials(username: string, password: string) {
  if (!supabase) {
    throw new Error("Supabase belum aktif. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY terlebih dahulu.");
  }

  const normalized = username.trim().toLowerCase();
  if (!normalized || !password.trim()) {
    throw new Error("Username dan password wajib diisi.");
  }

  const { data, error } = await supabase.rpc("app_login", {
    p_username: normalized,
    p_password: password,
  });

  if (error) {
    if (isRpcMissingError(error)) {
      const user = await signInLegacy(normalized, password);
      setSupabaseAppSessionToken(null);
      currentUser = user;
      persistUser(user);
      return user;
    }
    throw new Error(asErrorMessage(error, "Gagal login ke server auth."));
  }
  const row = Array.isArray(data) ? (data[0] as AppSessionRow | undefined) : undefined;
  if (!row) throw new Error("Username atau password salah.");

  const user = mapRowToAuthUser(row);
  setSupabaseAppSessionToken(user.sessionToken);
  currentUser = user;
  persistUser(user);
  return user;
}

export async function restoreAuthUser() {
  const stored = readUserFromStorage();
  if (!stored) {
    currentUser = null;
    setSupabaseAppSessionToken(null);
    return null;
  }

  if (stored.authMode === "legacy") {
    setSupabaseAppSessionToken(null);

    if (!supabase) {
      currentUser = stored;
      return stored;
    }

    const { data, error } = await supabase
      .from("app_users")
      .select("id, username, display_name, role, is_active")
      .eq("id", stored.id)
      .maybeSingle<LegacyUserRow>();

    if (error || !data || !data.is_active) {
      currentUser = null;
      persistUser(null);
      return null;
    }

    const user: AuthUser = {
      id: data.id,
      username: data.username,
      displayName: data.display_name ?? undefined,
      role: normalizeRole(data.role),
      sessionToken: "legacy-session",
      authMode: "legacy",
    };

    currentUser = user;
    persistUser(user);
    return user;
  }

  setSupabaseAppSessionToken(stored.sessionToken);

  if (!supabase) {
    currentUser = stored;
    return stored;
  }

  const { data, error } = await supabase.rpc("app_restore_session");

  if (error) {
    console.warn("Restore session gagal:", asErrorMessage(error, "unknown error"));
    currentUser = null;
    persistUser(null);
    setSupabaseAppSessionToken(null);
    return null;
  }

  const row = Array.isArray(data) ? (data[0] as AppSessionRow | undefined) : undefined;
  if (!row) {
    currentUser = null;
    persistUser(null);
    setSupabaseAppSessionToken(null);
    return null;
  }

  const user = mapRowToAuthUser(row);
  setSupabaseAppSessionToken(user.sessionToken);
  currentUser = user;
  persistUser(user);
  return user;
}

export async function signOutAppUser() {
  if (supabase) {
    const { error } = await supabase.rpc("app_logout");
    if (error) {
      console.warn("Logout RPC gagal:", asErrorMessage(error, "unknown error"));
    }
  }
  currentUser = null;
  persistUser(null);
  setSupabaseAppSessionToken(null);
}

export function getCurrentAuthUser() {
  if (!currentUser) {
    currentUser = readUserFromStorage();
  }
  return currentUser;
}

export function hasPermission(permission: AppPermission, user = getCurrentAuthUser()) {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

export function assertPermission(permission: AppPermission, message?: string) {
  const user = getCurrentAuthUser();
  if (!user) {
    throw new Error("Silakan login terlebih dahulu.");
  }
  if (!hasPermission(permission, user)) {
    throw new Error(message ?? "Anda tidak memiliki izin untuk aksi ini.");
  }
}
