import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_KEY ||
  "";

export const isSupabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);

const SUPABASE_APP_SESSION_HEADER = "x-app-session";

let appSessionToken: string | null = null;

function buildRestHeaders(token: string | null) {
  const headers: Record<string, string> = {};
  if (token) {
    headers[SUPABASE_APP_SESSION_HEADER] = token;
  }
  return headers;
}

export const supabase = isSupabaseEnabled
  ? createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: buildRestHeaders(appSessionToken),
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export function setSupabaseAppSessionToken(token: string | null) {
  appSessionToken = token;
  if (!supabase) return;

  const nextHeaders = buildRestHeaders(token);
  // Supabase JS keeps PostgREST headers on this internal client.
  (supabase as unknown as { rest: { headers: Record<string, string> } }).rest.headers = {
    ...(supabase as unknown as { rest: { headers: Record<string, string> } }).rest.headers,
    ...nextHeaders,
  };

  if (!token) {
    delete (supabase as unknown as { rest: { headers: Record<string, string> } }).rest.headers[
      SUPABASE_APP_SESSION_HEADER
    ];
  }
}

export function getSupabaseAppSessionToken() {
  return appSessionToken;
}

export type SupabaseTableName =
  | "materials"
  | "stock_movements"
  | "menu_categories"
  | "menus"
  | "recipes"
  | "sales";

export async function supabaseSelect<T>(table: SupabaseTableName, filters?: { column: string; value: unknown }[]) {
  if (!supabase) return [] as T[];

  let query = supabase.from(table).select("*");
  for (const filter of filters ?? []) {
    query = query.eq(filter.column, filter.value as never);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function supabaseInsert<T extends { id?: string }>(table: SupabaseTableName, row: T) {
  if (!supabase) return null;
  const { data, error } = await supabase.from(table).upsert(row, { onConflict: "id" }).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function supabaseUpdate<T extends { id: string }>(table: SupabaseTableName, row: T) {
  if (!supabase) return null;
  const { id, ...rest } = row as T & { id: string };
  const { data, error } = await supabase.from(table).update(rest).eq("id", id).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function supabaseDelete(table: SupabaseTableName, id: string) {
  if (!supabase) return;
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

export async function supabaseUpsertRow(table: SupabaseTableName, row: Record<string, unknown>) {
  if (!supabase) return null;
  const { data, error } = await supabase.from(table).upsert(row, { onConflict: "id" }).select();
  if (error) throw error;
  return data?.[0] ?? null;
}
