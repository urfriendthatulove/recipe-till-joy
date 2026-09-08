import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { uid } from "./db";

const orderStatusValues = [
  "new",
  "accepted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] as const;

type MobileOrderStatus = (typeof orderStatusValues)[number];

type MobileOrderItem = {
  id: string;
  menuItemId: string;
  menuName: string;
  menuCode?: string;
  priceSnapshot: number;
  qty: number;
  lineTotal: number;
  note?: string;
  modifiers: string[];
};

type MobileOrderRow = {
  id: string;
  order_number: string;
  external_order_id: string | null;
  source: string;
  status: MobileOrderStatus;
  customer_name: string | null;
  customer_phone: string | null;
  table_name: string | null;
  note: string | null;
  items: MobileOrderItem[] | unknown;
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};

const orderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  qty: z.number().int().positive(),
  note: z.string().trim().max(200).optional(),
  modifiers: z.array(z.string().trim().min(1).max(80)).default([]),
});

const createOrderSchema = z.object({
  externalOrderId: z.string().trim().min(1).max(120).optional(),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerPhone: z.string().trim().min(1).max(40).optional(),
  tableName: z.string().trim().min(1).max(40).optional(),
  note: z.string().trim().max(500).optional(),
  discount: z.number().min(0).optional(),
  items: z.array(orderItemSchema).min(1),
});

const updateOrderSchema = z.object({
  status: z.enum(orderStatusValues),
  note: z.string().trim().max(500).optional(),
});

type OrderItemInput = z.input<typeof orderItemSchema>;

function getEnvValue(env: unknown, keys: string[]) {
  const source = env && typeof env === "object" ? (env as Record<string, unknown>) : null;
  for (const key of keys) {
    const raw = source?.[key];
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }

  const processEnv = typeof process !== "undefined" ? process.env : undefined;
  for (const key of keys) {
    const raw = processEnv?.[key];
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }

  return "";
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function getCorsHeaders(env: unknown) {
  const allowedOrigin = getEnvValue(env, ["POS_API_ALLOWED_ORIGIN"]);
  return {
    "access-control-allow-origin": allowedOrigin || "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function getAuthorizationToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (!header) {
    return "";
  }

  return header.replace(/^Bearer\s+/i, "").trim();
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    return bytesToHex(new Uint8Array(digest));
  }

  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function isAllowedStatus(value: string): value is MobileOrderStatus {
  return orderStatusValues.includes(value as MobileOrderStatus);
}

function normalizeOrderRow(row: MobileOrderRow) {
  const items = Array.isArray(row.items) ? row.items : [];

  return {
    id: row.id,
    orderNumber: row.order_number,
    externalOrderId: row.external_order_id ?? undefined,
    source: row.source,
    status: row.status,
    customerName: row.customer_name ?? undefined,
    customerPhone: row.customer_phone ?? undefined,
    tableName: row.table_name ?? undefined,
    note: row.note ?? undefined,
    items,
    subtotal: normalizeNumber(row.subtotal),
    discount: normalizeNumber(row.discount),
    total: normalizeNumber(row.total),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
  };
}

function createAdminClient(env: unknown) {
  const supabaseUrl = getEnvValue(env, ["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
  const serviceRoleKey = getEnvValue(env, ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Konfigurasi backend Supabase belum lengkap. Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env backend POS.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function resolveMenuSnapshots(env: unknown, items: OrderItemInput[]) {
  const supabase = createAdminClient(env);
  const menuIds = [...new Set(items.map((item) => item.menuItemId))];
  const { data, error } = await supabase
    .from("menus")
    .select("id, code, name, price, is_active")
    .in("id", menuIds);

  if (error) {
    throw new Error(error.message || "Gagal membaca menu dari Supabase");
  }

  const menuById = new Map(
    (data ?? []).map((row) => [
      row.id,
      {
        id: row.id as string,
        code: (row.code as string | null | undefined) ?? undefined,
        name: row.name as string,
        price: Number(row.price ?? 0),
        isActive: Boolean(row.is_active),
      },
    ]),
  );

  const missing = menuIds.filter((id) => !menuById.has(id));
  if (missing.length > 0) {
    throw new Error(`Menu tidak ditemukan: ${missing.join(", ")}`);
  }

  const inactive = menuIds.filter((id) => !(menuById.get(id)?.isActive ?? false));
  if (inactive.length > 0) {
    throw new Error(`Menu tidak aktif: ${inactive.join(", ")}`);
  }

  return menuById;
}

async function nextOrderNumber(env: unknown, date = new Date()) {
  const supabase = createAdminClient(env);
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString();

  const { count, error } = await supabase
    .from("mobile_orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfDay)
    .lt("created_at", endOfDay);

  if (error) {
    throw new Error(error.message || "Gagal menghitung nomor order");
  }

  return `MOB-${ymd}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

async function createOrder(env: unknown, payload: z.input<typeof createOrderSchema>) {
  const supabase = createAdminClient(env);

  if (payload.externalOrderId) {
    const { data: existing, error: lookupError } = await supabase
      .from("mobile_orders")
      .select("*")
      .eq("external_order_id", payload.externalOrderId)
      .maybeSingle();

    if (lookupError) {
      throw new Error(lookupError.message || "Gagal memeriksa order yang sudah ada");
    }

    if (existing) {
      return normalizeOrderRow(existing as MobileOrderRow);
    }
  }

  const normalizedItems = payload.items.map((item) => ({
    ...item,
    modifiers: item.modifiers ?? [],
  }));

  const menuById = await resolveMenuSnapshots(env, normalizedItems);
  const orderNumber = await nextOrderNumber(env);
  const ts = new Date().toISOString();

  const items: MobileOrderItem[] = normalizedItems.map((item) => {
    const menu = menuById.get(item.menuItemId)!;
    const modifiers = item.modifiers.map((value) => value.trim()).filter(Boolean);
    const priceSnapshot = Number(menu.price ?? 0);
    const lineTotal = priceSnapshot * item.qty;

    return {
      id: uid(),
      menuItemId: menu.id,
      menuName: menu.name,
      priceSnapshot,
      qty: item.qty,
      lineTotal,
      ...(menu.code ? { menuCode: menu.code } : {}),
      ...(item.note?.trim() ? { note: item.note.trim() } : {}),
      modifiers,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = Math.min(Math.max(payload.discount ?? 0, 0), subtotal);
  const total = subtotal - discount;

  const row = {
    order_number: orderNumber,
    external_order_id: payload.externalOrderId ?? null,
    source: "mobile",
    status: "new",
    customer_name: payload.customerName ?? null,
    customer_phone: payload.customerPhone ?? null,
    table_name: payload.tableName ?? null,
    note: payload.note ?? null,
    items,
    subtotal,
    discount,
    total,
    created_at: ts,
    updated_at: ts,
  };

  const { data, error } = await supabase.from("mobile_orders").insert(row).select("*").single();
  if (error) {
    throw new Error(error.message || "Gagal menyimpan order mobile");
  }

  return normalizeOrderRow(data as MobileOrderRow);
}

async function listOrders(env: unknown, request: Request) {
  const supabase = createAdminClient(env);
  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25) || 25, 1), 100);

  let query = supabase.from("mobile_orders").select("*").order("created_at", { ascending: false }).limit(limit);

  if (status && isAllowedStatus(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "Gagal mengambil daftar order");
  }

  return (data ?? []).map((row) => normalizeOrderRow(row as MobileOrderRow));
}

async function getOrderById(env: unknown, orderId: string) {
  const supabase = createAdminClient(env);
  const { data, error } = await supabase.from("mobile_orders").select("*").eq("id", orderId).maybeSingle();

  if (error) {
    throw new Error(error.message || "Gagal mengambil detail order");
  }

  if (!data) {
    return null;
  }

  return normalizeOrderRow(data as MobileOrderRow);
}

async function updateOrder(env: unknown, orderId: string, payload: z.infer<typeof updateOrderSchema>) {
  const supabase = createAdminClient(env);
  const current = await getOrderById(env, orderId);
  if (!current) {
    return null;
  }

  const timestamp = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: payload.status,
    note: payload.note ?? current.note ?? null,
    updated_at: timestamp,
  };

  if (payload.status === "accepted" && !current.acceptedAt) {
    patch["accepted_at"] = timestamp;
  }
  if (payload.status === "completed" && !current.completedAt) {
    patch["completed_at"] = timestamp;
  }
  if (payload.status === "cancelled" && !current.cancelledAt) {
    patch["cancelled_at"] = timestamp;
  }

  const { data, error } = await supabase.from("mobile_orders").update(patch).eq("id", orderId).select("*").single();
  if (error) {
    throw new Error(error.message || "Gagal memperbarui order");
  }

  return normalizeOrderRow(data as MobileOrderRow);
}

async function verifyApiKey(request: Request, env: unknown) {
  const token = getAuthorizationToken(request);
  if (!token) {
    return false;
  }

  const expectedKeyHash = getEnvValue(env, ["POS_API_KEY_HASH", "POS_MOBILE_API_KEY_HASH"]);
  if (expectedKeyHash) {
    const salt = getEnvValue(env, ["POS_API_KEY_SALT", "POS_MOBILE_API_KEY_SALT"]);
    const candidateHash = await sha256Hex(salt ? `${salt}:${token}` : token);
    return constantTimeEqual(candidateHash, expectedKeyHash.toLowerCase());
  }

  const expectedKey = getEnvValue(env, ["POS_API_KEY", "POS_MOBILE_API_KEY"]);
  if (!expectedKey) {
    throw new Error("POS_API_KEY_HASH atau POS_API_KEY belum diset di backend POS");
  }

  return constantTimeEqual(token, expectedKey);
}

async function readJsonBody<T>(request: Request, schema: z.ZodType<T>) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new Error("Body JSON tidak valid");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Payload tidak valid");
  }

  return result.data;
}

export async function handleMobileOrdersRequest(request: Request, env: unknown) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  const pathPrefixes = ["/api/mobile/orders", "/api/orders"];
  const matchedPrefix = pathPrefixes.find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!matchedPrefix) {
    return null;
  }

  const corsHeaders = getCorsHeaders(env);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (!(await verifyApiKey(request, env))) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401, corsHeaders);
    }

    if (request.method === "POST" && pathname === matchedPrefix) {
      const payload = await readJsonBody(request, createOrderSchema);
      const order = await createOrder(env, payload);
      return jsonResponse({ ok: true, data: order }, 201, corsHeaders);
    }

    if (request.method === "GET" && pathname === matchedPrefix) {
      const orders = await listOrders(env, request);
      return jsonResponse({ ok: true, data: orders }, 200, corsHeaders);
    }

    const orderId = pathname.slice(`${matchedPrefix}/`.length).trim();
    if (!orderId) {
      return jsonResponse({ ok: false, error: "Route tidak ditemukan" }, 404, corsHeaders);
    }

    if (request.method === "GET") {
      const order = await getOrderById(env, orderId);
      if (!order) {
        return jsonResponse({ ok: false, error: "Order tidak ditemukan" }, 404, corsHeaders);
      }
      return jsonResponse({ ok: true, data: order }, 200, corsHeaders);
    }

    if (request.method === "PATCH") {
      const payload = await readJsonBody(request, updateOrderSchema);
      const order = await updateOrder(env, orderId, payload);
      if (!order) {
        return jsonResponse({ ok: false, error: "Order tidak ditemukan" }, 404, corsHeaders);
      }
      return jsonResponse({ ok: true, data: order }, 200, corsHeaders);
    }

    return jsonResponse({ ok: false, error: "Method tidak didukung" }, 405, corsHeaders);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Gagal memproses request order";
    return jsonResponse({ ok: false, error: message }, 400, corsHeaders);
  }
}