import { supabase } from "./supabase";

export type MobileOrderStatus = "new" | "accepted" | "preparing" | "ready" | "completed" | "cancelled";

export type MobileFulfilmentMode = "delivery" | "pickup" | "dine_in" | "pre_order";

export interface MobileOrderItem {
  id: string;
  menuItemId: string;
  menuName: string;
  menuCode?: string;
  priceSnapshot: number;
  qty: number;
  lineTotal: number;
  note?: string;
  modifiers: string[];
}

export interface MobileOrder {
  id: string;
  orderNumber: string;
  externalOrderId?: string;
  source: string;
  status: MobileOrderStatus;
  customerName?: string;
  customerPhone?: string;
  tableName?: string;
  note?: string;
  storeId?: string;
  fulfilmentMode?: MobileFulfilmentMode;
  paymentMethod?: string;
  voucherCode?: string;
  items: MobileOrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}

const ORDER_STATUS_LABELS: Record<MobileOrderStatus, string> = {
  new: "Baru",
  accepted: "Diterima",
  preparing: "Disiapkan",
  ready: "Siap",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const ORDER_STATUS_BADGES: Record<MobileOrderStatus, string> = {
  new: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  accepted: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  preparing: "border-blue-500/40 bg-blue-500/10 text-blue-700",
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  completed: "border-zinc-500/40 bg-zinc-500/10 text-zinc-700",
  cancelled: "border-destructive/40 bg-destructive/10 text-destructive",
};

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeOrderItem(item: any): MobileOrderItem {
  return {
    id: String(item.id ?? crypto.randomUUID()),
    menuItemId: String(item.menuItemId ?? item.menu_item_id ?? ""),
    menuName: String(item.menuName ?? item.menu_name ?? ""),
    menuCode: item.menuCode ?? item.menu_code ?? undefined,
    priceSnapshot: normalizeNumber(item.priceSnapshot ?? item.price_snapshot),
    qty: normalizeNumber(item.qty),
    lineTotal: normalizeNumber(item.lineTotal ?? item.line_total),
    note: item.note ?? undefined,
    modifiers: Array.isArray(item.modifiers) ? item.modifiers.map((value) => String(value)) : [],
  };
}

function normalizeOrderRow(row: any): MobileOrder {
  return {
    id: String(row.id),
    orderNumber: String(row.order_number ?? row.orderNumber ?? ""),
    externalOrderId: row.external_order_id ?? row.externalOrderId ?? undefined,
    source: String(row.source ?? "mobile"),
    status: row.status as MobileOrderStatus,
    customerName: row.customer_name ?? row.customerName ?? undefined,
    customerPhone: row.customer_phone ?? row.customerPhone ?? undefined,
    tableName: row.table_name ?? row.tableName ?? undefined,
    note: row.note ?? undefined,
    storeId: row.store_id ?? row.storeId ?? undefined,
    fulfilmentMode: row.fulfilment_mode ?? row.fulfilmentMode ?? undefined,
    paymentMethod: row.payment_method ?? row.paymentMethod ?? undefined,
    voucherCode: row.voucher_code ?? row.voucherCode ?? undefined,
    items: Array.isArray(row.items) ? row.items.map(normalizeOrderItem) : [],
    subtotal: normalizeNumber(row.subtotal),
    discount: normalizeNumber(row.discount),
    deliveryFee: normalizeNumber(row.delivery_fee ?? row.deliveryFee),
    total: normalizeNumber(row.total),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString()),
    acceptedAt: row.accepted_at ?? row.acceptedAt ?? undefined,
    completedAt: row.completed_at ?? row.completedAt ?? undefined,
    cancelledAt: row.cancelled_at ?? row.cancelledAt ?? undefined,
  };
}

const FULFILMENT_MODE_LABELS: Record<MobileFulfilmentMode, string> = {
  delivery: "Delivery",
  pickup: "Ambil sendiri",
  dine_in: "Makan di tempat",
  pre_order: "Jadwalkan",
};

export function getMobileFulfilmentModeLabel(mode?: MobileFulfilmentMode) {
  if (!mode) return undefined;
  return FULFILMENT_MODE_LABELS[mode] ?? mode;
}

export function getMobileOrderStatusLabel(status: MobileOrderStatus) {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function getMobileOrderStatusClassName(status: MobileOrderStatus) {
  return ORDER_STATUS_BADGES[status] ?? "border-border bg-secondary text-foreground";
}

export function isMobileOrderActive(status: MobileOrderStatus) {
  return status === "new" || status === "accepted" || status === "preparing" || status === "ready";
}

export async function fetchMobileOrders(limit = 25) {
  if (!supabase) return [] as MobileOrder[];

  const { data, error } = await supabase
    .from("mobile_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(normalizeOrderRow);
}

export async function updateMobileOrderStatus(orderId: string, status: MobileOrderStatus, note?: string) {
  if (!supabase) {
    throw new Error("Supabase belum aktif");
  }

  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (note?.trim()) {
    payload.note = note.trim();
  }

  if (status === "accepted") payload.accepted_at = new Date().toISOString();
  if (status === "completed") payload.completed_at = new Date().toISOString();
  if (status === "cancelled") payload.cancelled_at = new Date().toISOString();

  const { data, error } = await supabase.from("mobile_orders").update(payload).eq("id", orderId).select("*").single();
  if (error) throw error;
  return normalizeOrderRow(data);
}