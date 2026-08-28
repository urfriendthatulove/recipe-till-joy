import {
  db,
  nowISO,
  uid,
  type MenuItem,
  type RawMaterial,
  type RecipeItem,
  type Sale,
  type SaleItem,
  type StockMovement,
} from "./db";
import { assertPermission } from "./auth";
import { seedIfEmpty } from "./seed";
import { isSupabaseEnabled, supabase } from "./supabase";

export interface CartLine {
  menuItemId: string;
  qty: number;
  /** diskon per baris dalam Rupiah (total baris, bukan per pcs) */
  discount: number;
}

export interface SaleInput {
  lines: CartLine[];
  paymentMethod: Sale["paymentMethod"];
  /** diskon tambahan tingkat nota (Rupiah) */
  discount?: number;
  note?: string;
}

async function nextSaleNumber(date = new Date()) {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate(),
  ).padStart(2, "0")}`;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
  const count = await db.sales.where("createdAt").aboveOrEqual(start).count();
  return `QNS-${ymd}-${String(count + 1).padStart(4, "0")}`;
}

export function materialUsage(
  lines: CartLine[],
  recipes: RecipeItem[],
): Map<string, number> {
  const need = new Map<string, number>();
  for (const line of lines) {
    for (const r of recipes.filter((x) => x.menuItemId === line.menuItemId)) {
      need.set(r.materialId, (need.get(r.materialId) ?? 0) + r.qty * line.qty);
    }
  }
  return need;
}

export async function createSale(input: SaleInput) {
  assertPermission("sales.create", "Akun ini tidak memiliki izin untuk mencatat transaksi.");
  const clean = input.lines.filter((l) => l.qty > 0);
  if (clean.length === 0) throw new Error("Keranjang masih kosong");

  if (isSupabaseEnabled && supabase) {
    const { data, error } = await supabase.rpc("app_create_sale", {
      p_lines: clean.map((line) => ({
        menu_item_id: line.menuItemId,
        qty: line.qty,
        discount: line.discount,
      })),
      p_payment_method: input.paymentMethod,
      p_bill_discount: input.discount ?? 0,
      p_note: input.note ?? null,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      throw new Error("Gagal menyimpan transaksi");
    }

    const sale: Sale = {
      id: row.id,
      saleNumber: row.sale_number,
      createdAt: row.created_at,
      items: Array.isArray(row.items)
        ? (row.items as SaleItem[])
        : [],
      subtotal: Number(row.subtotal ?? 0),
      discount: Number(row.discount ?? 0),
      netSales: Number(row.net_sales ?? 0),
      totalCost: Number(row.total_cost ?? 0),
      profit: Number(row.profit ?? 0),
      paymentMethod: row.payment_method,
      note: row.note ?? undefined,
      voided: row.voided ? 1 : 0,
    };

    await seedIfEmpty();
    return sale;
  }

  return db.transaction(
    "rw",
    db.sales,
    db.menus,
    db.recipes,
    db.materials,
    db.movements,
    async () => {
      const ts = nowISO();
      const saleId = uid();
      const saleNumber = await nextSaleNumber(new Date(ts));

      const menus = new Map<string, MenuItem>();
      for (const l of clean) {
        const m = await db.menus.get(l.menuItemId);
        if (!m) throw new Error("Menu tidak ditemukan");
        menus.set(m.id, m);
      }

      const allRecipes = await db.recipes.toArray();
      const need = materialUsage(clean, allRecipes);
      const mats = new Map<string, RawMaterial>();
      for (const [materialId, qty] of need) {
        const mat = await db.materials.get(materialId);
        if (!mat) continue;
        if (mat.currentStock < qty) {
          throw new Error(`Stok ${mat.name} tidak cukup (butuh ${qty} ${mat.unit}, tersisa ${mat.currentStock} ${mat.unit})`);
        }
        mats.set(materialId, mat);
      }

      const items: SaleItem[] = clean.map((l) => {
        const menu = menus.get(l.menuItemId)!;
        const recipeCost = allRecipes
          .filter((r) => r.menuItemId === menu.id)
          .reduce((s, r) => s + r.qty * (mats.get(r.materialId)?.costPerUnit ?? 0), 0);
        const unitCost = recipeCost + (menu.directCost ?? 0);
        const gross = menu.price * l.qty;
        const discount = Math.min(Math.max(l.discount, 0), gross);
        const item: SaleItem = {
          id: uid(),
          menuItemId: menu.id,
          nameSnapshot: menu.name,
          priceSnapshot: menu.price,
          qty: l.qty,
          discount,
          lineNet: gross - discount,
          lineCost: unitCost * l.qty,
        };
        return item;
      });

      const subtotal = items.reduce((s, i) => s + i.priceSnapshot * i.qty, 0);
      const lineDiscount = items.reduce((s, i) => s + i.discount, 0);
      const billDiscount = Math.min(Math.max(input.discount ?? 0, 0), subtotal - lineDiscount);
      const discount = lineDiscount + billDiscount;
      const netSales = subtotal - discount;
      const totalCost = items.reduce((s, i) => s + i.lineCost, 0);

      for (const [materialId, qty] of need) {
        const mat = mats.get(materialId);
        if (!mat) continue;
        const balanceAfter = mat.currentStock - qty;
        await db.materials.update(mat.id, { currentStock: balanceAfter, updatedAt: ts });
        const mv: StockMovement = {
          id: uid(),
          materialId: mat.id,
          type: "out",
          qty,
          balanceAfter,
          refType: "sale",
          refId: saleId,
          note: `Penjualan ${saleNumber}`,
          createdAt: ts,
        };
        await db.movements.add(mv);
      }

      const sale: Sale = {
        id: saleId,
        saleNumber,
        createdAt: ts,
        items,
        subtotal,
        discount,
        netSales,
        totalCost,
        profit: netSales - totalCost,
        paymentMethod: input.paymentMethod,
        voided: 0,
      };
      if (input.note?.trim()) sale.note = input.note.trim();
      await db.sales.add(sale);

      return sale;
    },
  );
}

export async function voidSale(saleId: string, reason?: string) {
  assertPermission("sales.void", "Hanya admin yang dapat membatalkan nota.");
  if (isSupabaseEnabled && supabase) {
    const { error } = await supabase.rpc("app_void_sale", {
      p_sale_id: saleId,
      p_reason: reason ?? null,
    });
    if (error) throw error;
    await seedIfEmpty();
    return;
  }

  await db.transaction("rw", db.sales, db.recipes, db.materials, db.movements, async () => {
    const sale = await db.sales.get(saleId);
    if (!sale) throw new Error("Nota tidak ditemukan");
    if (sale.voided) throw new Error("Nota ini sudah dibatalkan");

    const ts = nowISO();
    const outs = (await db.movements.where("refId").equals(saleId).toArray()).filter((m) => m.type === "out");

    for (const mv of outs) {
      const mat = await db.materials.get(mv.materialId);
      if (!mat) continue;
      const balanceAfter = mat.currentStock + mv.qty;
      await db.materials.update(mat.id, { currentStock: balanceAfter, updatedAt: ts });
      await db.movements.add({
        id: uid(),
        materialId: mat.id,
        type: "in",
        qty: mv.qty,
        balanceAfter,
        refType: "sale",
        refId: saleId,
        note: `Pembatalan ${sale.saleNumber}${reason ? ` — ${reason}` : ""}`,
        createdAt: ts,
      });
    }

    await db.sales.update(saleId, { voided: 1 });
  });
}

export const PAYMENT_LABEL: Record<Sale["paymentMethod"], string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
};
