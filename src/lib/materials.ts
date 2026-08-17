import { db, nowISO, uid, type MovementType, type RawMaterial, type StockMovement } from "./db";
import { isSupabaseEnabled, supabase } from "./supabase";

export interface MaterialInput {
  name: string;
  supplier?: string;
  unit: RawMaterial["unit"];
  minStock: number;
  costPerUnit: number;
  /** harga beli per kemasan */
  purchasePrice?: number;
  /** jumlah/isi per kemasan dalam satuan dasar */
  packSize?: number;
  /** hanya dipakai saat membuat bahan baru: stok awal */
  openingStock?: number;
}

const mapMaterialRow = (m: RawMaterial) => ({
  id: m.id,
  name: m.name,
  supplier: m.supplier ?? null,
  unit: m.unit,
  current_stock: m.currentStock,
  min_stock: m.minStock,
  purchase_price: m.purchasePrice ?? null,
  pack_size: m.packSize ?? null,
  cost_per_unit: m.costPerUnit,
  is_active: m.isActive === 1,
  created_at: m.createdAt,
  updated_at: m.updatedAt,
});

const materialFromSupabase = (row: any): RawMaterial => ({
  id: row.id,
  name: row.name,
  supplier: row.supplier ?? undefined,
  unit: row.unit,
  currentStock: Number(row.current_stock ?? 0),
  minStock: Number(row.min_stock ?? 0),
  purchasePrice: row.purchase_price ?? undefined,
  packSize: row.pack_size ?? undefined,
  costPerUnit: Number(row.cost_per_unit ?? 0),
  isActive: row.is_active ? 1 : 0,
  createdAt: row.created_at ?? nowISO(),
  updatedAt: row.updated_at ?? nowISO(),
});

export async function createMaterial(input: MaterialInput) {
  const ts = nowISO();
  const id = uid();
  const opening = input.openingStock ?? 0;
  const row: RawMaterial = {
    id,
    name: input.name.trim(),
    supplier: input.supplier?.trim() || undefined,
    unit: input.unit,
    currentStock: opening,
    minStock: input.minStock,
    costPerUnit: input.costPerUnit,
    ...(input.purchasePrice !== undefined ? { purchasePrice: input.purchasePrice } : {}),
    ...(input.packSize !== undefined ? { packSize: input.packSize } : {}),
    isActive: 1,
    createdAt: ts,
    updatedAt: ts,
  };

  if (isSupabaseEnabled && supabase) {
    const { error } = await supabase.from("materials").upsert(mapMaterialRow(row), { onConflict: "id" });
    if (error) throw error;

    if (opening > 0) {
      const movement: StockMovement = {
        id: uid(),
        materialId: id,
        type: "in",
        qty: opening,
        balanceAfter: opening,
        unitCost: input.costPerUnit,
        refType: "manual",
        note: "Stok awal",
        createdAt: ts,
      };
      const { error: mvErr } = await supabase.from("stock_movements").upsert({
        id: movement.id,
        material_id: movement.materialId,
        type: movement.type,
        qty: movement.qty,
        balance_after: movement.balanceAfter,
        unit_cost: movement.unitCost ?? null,
        ref_type: movement.refType,
        ref_id: movement.refId ?? null,
        note: movement.note ?? null,
        created_at: movement.createdAt,
      }, { onConflict: "id" });
      if (mvErr) throw mvErr;
    }

    await db.materials.put(row);
    if (opening > 0) await db.movements.put({
      id: row.id + "-init-movement",
      materialId: id,
      type: "in",
      qty: opening,
      balanceAfter: opening,
      unitCost: input.costPerUnit,
      refType: "manual",
      note: "Stok awal",
      createdAt: ts,
    });
    return id;
  }

  await db.transaction("rw", db.materials, db.movements, async () => {
    await db.materials.add(row);
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
  const ts = nowISO();
  const base = await db.materials.get(id);
  const row: RawMaterial = {
    ...(base ?? { id, currentStock: 0, isActive: 1, createdAt: ts, updatedAt: ts }),
    id,
    name: input.name.trim(),
    supplier: input.supplier?.trim() || base?.supplier || undefined,
    unit: input.unit,
    minStock: input.minStock,
    costPerUnit: input.costPerUnit,
    ...(input.purchasePrice !== undefined ? { purchasePrice: input.purchasePrice } : {}),
    ...(input.packSize !== undefined ? { packSize: input.packSize } : {}),
    updatedAt: ts,
  };

  if (isSupabaseEnabled && supabase) {
    const { error } = await supabase.from("materials").update({
      name: row.name,
      supplier: row.supplier ?? null,
      unit: row.unit,
      min_stock: row.minStock,
      cost_per_unit: row.costPerUnit,
      purchase_price: row.purchasePrice ?? null,
      pack_size: row.packSize ?? null,
      updated_at: ts,
    }).eq("id", id);
    if (error) throw error;
    await db.materials.put(row);
    return;
  }

  await db.materials.update(id, {
    name: input.name.trim(),
    unit: input.unit,
    minStock: input.minStock,
    costPerUnit: input.costPerUnit,
    ...(input.purchasePrice !== undefined ? { purchasePrice: input.purchasePrice } : {}),
    ...(input.packSize !== undefined ? { packSize: input.packSize } : {}),
    updatedAt: ts,
  });
}

/** Nonaktifkan (soft delete) supaya riwayat transaksi lama tetap valid. */
export async function archiveMaterial(id: string) {
  const ts = nowISO();
  if (isSupabaseEnabled && supabase) {
    const { error } = await supabase.from("materials").update({ is_active: false, updated_at: ts }).eq("id", id);
    if (error) throw error;
    const current = await db.materials.get(id);
    if (current) await db.materials.put({ ...current, isActive: 0, updatedAt: ts });
    return;
  }
  await db.materials.update(id, { isActive: 0, updatedAt: ts });
}

export async function restoreMaterial(id: string) {
  const ts = nowISO();
  if (isSupabaseEnabled && supabase) {
    const { error } = await supabase.from("materials").update({ is_active: true, updated_at: ts }).eq("id", id);
    if (error) throw error;
    const current = await db.materials.get(id);
    if (current) await db.materials.put({ ...current, isActive: 1, updatedAt: ts });
    return;
  }
  await db.materials.update(id, { isActive: 1, updatedAt: ts });
}

export async function recordMovement(params: {
  materialId: string;
  type: MovementType;
  qty: number;
  unitCost?: number;
  note?: string;
  refType?: StockMovement["refType"];
  refId?: string;
}) {
  if (isSupabaseEnabled && supabase) {
    const mat = await db.materials.get(params.materialId);
    if (!mat) throw new Error("Bahan baku tidak ditemukan");

    let delta = 0;
    let qty = params.qty;

    if (params.type === "in") delta = qty;
    else if (params.type === "out" || params.type === "waste") delta = -qty;
    else {
      delta = qty - mat.currentStock;
      qty = Math.abs(delta);
    }

    const balanceAfter = mat.currentStock + delta;
    if (balanceAfter < 0) {
      throw new Error(`Stok ${mat.name} tidak mencukupi (tersisa ${mat.currentStock} ${mat.unit})`);
    }

    const movement: StockMovement = {
      id: uid(),
      materialId: mat.id,
      type: params.type,
      qty,
      balanceAfter,
      refType: params.refType ?? "manual",
      refId: params.refId,
      note: params.note,
      createdAt: nowISO(),
    };
    if (params.unitCost !== undefined) movement.unitCost = params.unitCost;

    const { error } = await supabase.from("stock_movements").upsert({
      id: movement.id,
      material_id: movement.materialId,
      type: movement.type,
      qty: movement.qty,
      balance_after: movement.balanceAfter,
      unit_cost: movement.unitCost ?? null,
      ref_type: movement.refType,
      ref_id: movement.refId ?? null,
      note: movement.note ?? null,
      created_at: movement.createdAt,
    }, { onConflict: "id" });
    if (error) throw error;

    const updated = { ...mat, currentStock: balanceAfter, updatedAt: nowISO() } as RawMaterial;
    if (params.type === "in" && params.unitCost && params.unitCost > 0) {
      updated.costPerUnit = params.unitCost;
    }
    await supabase.from("materials").update({
      current_stock: balanceAfter,
      cost_per_unit: updated.costPerUnit,
      updated_at: updated.updatedAt,
    }).eq("id", mat.id);

    await db.materials.put(updated);
    await db.movements.put(movement);
    return balanceAfter;
  }

  return db.transaction("rw", db.materials, db.movements, async () => {
    const mat = await db.materials.get(params.materialId);
    if (!mat) throw new Error("Bahan baku tidak ditemukan");

    let delta = 0;
    let qty = params.qty;

    if (params.type === "in") delta = qty;
    else if (params.type === "out" || params.type === "waste") delta = -qty;
    else {
      delta = qty - mat.currentStock;
      qty = Math.abs(delta);
    }

    const balanceAfter = mat.currentStock + delta;
    if (balanceAfter < 0) {
      throw new Error(`Stok ${mat.name} tidak mencukupi (tersisa ${mat.currentStock} ${mat.unit})`);
    }

    const patch: Partial<RawMaterial> = { currentStock: balanceAfter, updatedAt: nowISO() };
    if (params.type === "in" && params.unitCost && params.unitCost > 0) {
      patch.costPerUnit = params.unitCost;
    }
    await db.materials.update(mat.id, patch);

    const movement: StockMovement = {
      id: uid(),
      materialId: mat.id,
      type: params.type,
      qty,
      balanceAfter,
      refType: params.refType ?? "manual",
      createdAt: nowISO(),
    };
    if (params.unitCost !== undefined) movement.unitCost = params.unitCost;
    if (params.refId !== undefined) movement.refId = params.refId;
    if (params.note !== undefined) movement.note = params.note;
    await db.movements.add(movement);

    return balanceAfter;
  });
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  in: "Stok masuk",
  out: "Terpakai",
  adjustment: "Penyesuaian",
  waste: "Rusak / buang",
};
