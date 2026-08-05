import type { RawMaterial, Sale, StockMovement } from "./db";

export type RangeKey = "today" | "7d" | "30d" | "month" | "all";

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Hari ini",
  "7d": "7 hari terakhir",
  "30d": "30 hari terakhir",
  month: "Bulan ini",
  all: "Semua data",
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Batas awal & akhir (ISO) untuk rentang laporan. */
export function rangeBounds(key: RangeKey, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start: Date;
  switch (key) {
    case "today":
      start = startOfDay(now);
      break;
    case "7d":
      start = startOfDay(new Date(now.getTime() - 6 * 86400000));
      break;
    case "30d":
      start = startOfDay(new Date(now.getTime() - 29 * 86400000));
      break;
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      start = new Date(0);
  }
  return { start, end, startISO: start.toISOString(), endISO: end.toISOString() };
}

export const inRange = (iso: string, start: Date, end: Date) => {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
};

export interface Summary {
  omzet: number;
  diskon: number;
  hpp: number;
  laba: number;
  margin: number;
  nota: number;
  itemTerjual: number;
  avgNota: number;
}

export function summarize(sales: Sale[]): Summary {
  const valid = sales.filter((s) => !s.voided);
  const omzet = valid.reduce((s, x) => s + x.netSales, 0);
  const diskon = valid.reduce((s, x) => s + x.discount, 0);
  const hpp = valid.reduce((s, x) => s + x.totalCost, 0);
  const itemTerjual = valid.reduce(
    (s, x) => s + x.items.reduce((n, i) => n + i.qty, 0),
    0,
  );
  const laba = omzet - hpp;
  return {
    omzet,
    diskon,
    hpp,
    laba,
    margin: omzet > 0 ? (laba / omzet) * 100 : 0,
    nota: valid.length,
    itemTerjual,
    avgNota: valid.length ? omzet / valid.length : 0,
  };
}

/** Deret omzet & laba per hari, termasuk hari tanpa transaksi. */
export function dailySeries(sales: Sale[], start: Date, end: Date) {
  const map = new Map<string, { omzet: number; laba: number; nota: number }>();
  const from = startOfDay(start).getTime();
  const to = startOfDay(end).getTime();
  const span = Math.min(Math.round((to - from) / 86400000), 92);
  for (let i = 0; i <= span; i++) {
    const d = new Date(from + i * 86400000);
    map.set(d.toISOString().slice(0, 10), { omzet: 0, laba: 0, nota: 0 });
  }
  for (const s of sales) {
    if (s.voided) continue;
    const d = new Date(s.createdAt);
    const key = startOfDay(d).toISOString().slice(0, 10);
    const row = map.get(key);
    if (!row) continue;
    row.omzet += s.netSales;
    row.laba += s.netSales - s.totalCost;
    row.nota += 1;
  }
  return [...map.entries()].map(([date, v]) => ({
    date,
    label: new Date(date).toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
    ...v,
  }));
}

export interface MenuStat {
  menuItemId: string;
  name: string;
  qty: number;
  omzet: number;
  hpp: number;
  laba: number;
}

/** Peringkat menu berdasarkan kontribusi omzet & laba. */
export function menuRanking(sales: Sale[]): MenuStat[] {
  const map = new Map<string, MenuStat>();
  for (const s of sales) {
    if (s.voided) continue;
    for (const i of s.items) {
      const cur =
        map.get(i.menuItemId) ??
        { menuItemId: i.menuItemId, name: i.nameSnapshot, qty: 0, omzet: 0, hpp: 0, laba: 0 };
      cur.qty += i.qty;
      cur.omzet += i.lineNet;
      cur.hpp += i.lineCost;
      cur.laba = cur.omzet - cur.hpp;
      map.set(i.menuItemId, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.omzet - a.omzet);
}

export function paymentBreakdown(sales: Sale[]) {
  const map = new Map<Sale["paymentMethod"], { total: number; nota: number }>();
  for (const s of sales) {
    if (s.voided) continue;
    const cur = map.get(s.paymentMethod) ?? { total: 0, nota: 0 };
    cur.total += s.netSales;
    cur.nota += 1;
    map.set(s.paymentMethod, cur);
  }
  return map;
}

export interface UsageStat {
  materialId: string;
  name: string;
  unit: string;
  terpakai: number;
  waste: number;
  nilai: number;
}

/** Pemakaian bahan baku pada rentang waktu, dari kartu stok. */
export function materialUsageReport(
  movements: StockMovement[],
  materials: RawMaterial[],
): UsageStat[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const map = new Map<string, UsageStat>();
  for (const mv of movements) {
    if (mv.type !== "out" && mv.type !== "waste") continue;
    const mat = byId.get(mv.materialId);
    if (!mat) continue;
    const cur =
      map.get(mv.materialId) ??
      { materialId: mat.id, name: mat.name, unit: mat.unit, terpakai: 0, waste: 0, nilai: 0 };
    if (mv.type === "waste") cur.waste += mv.qty;
    else cur.terpakai += mv.qty;
    cur.nilai += mv.qty * mat.costPerUnit;
    map.set(mv.materialId, cur);
  }
  return [...map.values()].sort((a, b) => b.nilai - a.nilai);
}

/** Nilai persediaan saat ini (stok × harga pokok). */
export const inventoryValue = (materials: RawMaterial[]) =>
  materials
    .filter((m) => m.isActive)
    .reduce((s, m) => s + m.currentStock * m.costPerUnit, 0);

export function toCSV(rows: (string | number)[][]) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const v = String(c);
          return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(";"),
    )
    .join("\n");
}

export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const blob = new Blob(["\uFEFF" + toCSV(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
