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

/** QNS-20260804-0007 */
async function nextSaleNumber(date = new Date()) {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate(),
  ).padStart(2, "0")}`;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
  const count = await db.sales.where("createdAt").aboveOrEqual(start).count();
  return `QNS-${ymd}-${String(count + 1).padStart(4, "0")}`;
}

/** Kebutuhan bahan untuk isi keranjang, dipakai untuk cek stok sebelum bayar. */
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

/**
 * Simpan penjualan + potong stok bahan sesuai resep, dalam satu transaksi.
 * Kalau ada bahan yang tidak cukup, seluruh transaksi dibatalkan.
 */
export async function createSale(input: SaleInput) {
  const clean = input.lines.filter((l) => l.qty > 0);
  if (clean.length === 0) throw new Error("Keranjang masih kosong");

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

      // Validasi stok dulu, baru potong.
      const mats = new Map<string, RawMaterial>();
      for (const [materialId, qty] of need) {
        const mat = await db.materials.get(materialId);
        if (!mat) continue;
        if (mat.currentStock < qty) {
          throw new Error(
            `Stok ${mat.name} tidak cukup (butuh ${qty} ${mat.unit}, tersisa ${mat.currentStock} ${mat.unit})`,
          );
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
      const billDiscount = Math.min(
        Math.max(input.discount ?? 0, 0),
        subtotal - lineDiscount,
      );
      const discount = lineDiscount + billDiscount;
      const netSales = subtotal - discount;
      const totalCost = items.reduce((s, i) => s + i.lineCost, 0);

      // Potong stok lewat kartu stok supaya tetap bisa diaudit.
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

/** Batalkan nota: stok bahan dikembalikan lewat kartu stok. */
export async function voidSale(saleId: string, reason?: string) {
  await db.transaction("rw", db.sales, db.recipes, db.materials, db.movements, async () => {
    const sale = await db.sales.get(saleId);
    if (!sale) throw new Error("Nota tidak ditemukan");
    if (sale.voided) throw new Error("Nota ini sudah dibatalkan");

    const ts = nowISO();
    const outs = (await db.movements.where("refId").equals(saleId).toArray()).filter(
      (m) => m.type === "out",
    );

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
