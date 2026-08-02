import { db, nowISO, uid, type MovementType, type RawMaterial, type StockMovement } from "./db";

export interface MaterialInput {
  name: string;
  unit: RawMaterial["unit"];
  minStock: number;
  costPerUnit: number;
  /** hanya dipakai saat membuat bahan baru: stok awal */
  openingStock?: number;
}

export async function createMaterial(input: MaterialInput) {
  const ts = nowISO();
  const id = uid();
  const opening = input.openingStock ?? 0;

  await db.transaction("rw", db.materials, db.movements, async () => {
    await db.materials.add({
      id,
      name: input.name.trim(),
      unit: input.unit,
      currentStock: opening,
      minStock: input.minStock,
      costPerUnit: input.costPerUnit,
      isActive: 1,
      createdAt: ts,
      updatedAt: ts,
    });
    if (opening > 0) {
      await db.movements.add({
        id: uid(),
        materialId: id,
        type: "in",
        qty: opening,
        balanceAfter: opening,
        unitCost: input.costPerUnit,
        refType: "manual",
        note: "Stok awal",
        createdAt: ts,
      });
    }
  });

  return id;
}

export async function updateMaterial(id: string, input: MaterialInput) {
  await db.materials.update(id, {
    name: input.name.trim(),
    unit: input.unit,
    minStock: input.minStock,
    costPerUnit: input.costPerUnit,
    updatedAt: nowISO(),
  });
}

/** Nonaktifkan (soft delete) supaya riwayat transaksi lama tetap valid. */
export async function archiveMaterial(id: string) {
  await db.materials.update(id, { isActive: 0, updatedAt: nowISO() });
}

export async function restoreMaterial(id: string) {
  await db.materials.update(id, { isActive: 1, updatedAt: nowISO() });
}

/**
 * Satu-satunya jalan mengubah stok: selalu lewat kartu stok (StockMovement),
 * sehingga setiap perubahan bisa ditelusuri.
 */
export async function recordMovement(params: {
  materialId: string;
  type: MovementType;
  /** untuk "adjustment": ini adalah stok hasil hitung fisik (stock opname) */
  qty: number;
  unitCost?: number;
  note?: string;
  refType?: StockMovement["refType"];
  refId?: string;
}) {
  return db.transaction("rw", db.materials, db.movements, async () => {
    const mat = await db.materials.get(params.materialId);
    if (!mat) throw new Error("Bahan baku tidak ditemukan");

    let delta = 0;
    let qty = params.qty;

    if (params.type === "in") delta = qty;
    else if (params.type === "out" || params.type === "waste") delta = -qty;
    else {
      // adjustment: qty = stok fisik hasil opname
      delta = qty - mat.currentStock;
      qty = Math.abs(delta);
    }

    const balanceAfter = mat.currentStock + delta;
    if (balanceAfter < 0) {
      throw new Error(`Stok ${mat.name} tidak mencukupi (tersisa ${mat.currentStock} ${mat.unit})`);
    }

    const patch: Partial<RawMaterial> = { currentStock: balanceAfter, updatedAt: nowISO() };
    // Restock dengan harga baru memperbarui harga pokok bahan.
    if (params.type === "in" && params.unitCost && params.unitCost > 0) {
      patch.costPerUnit = params.unitCost;
    }
    await db.materials.update(mat.id, patch);

    await db.movements.add({
      id: uid(),
      materialId: mat.id,
      type: params.type,
      qty,
      balanceAfter,
      unitCost: params.unitCost,
      refType: params.refType ?? "manual",
      refId: params.refId,
      note: params.note,
      createdAt: nowISO(),
    });

    return balanceAfter;
  });
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  in: "Stok masuk",
  out: "Terpakai",
  adjustment: "Penyesuaian",
  waste: "Rusak / buang",
};
