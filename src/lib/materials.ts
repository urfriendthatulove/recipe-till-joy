import { db, nowISO, uid, type MovementType, type RawMaterial, type StockMovement } from "./db";
import { assertPermission } from "./auth";
import { isSupabaseEnabled, supabase } from "./supabase";

export interface MaterialInput {
  name: string;
  supplier?: string;
  unit: RawMaterial["unit"];
  minStock: number;
  costPerUnit: number;
  materialType?: RawMaterial["materialType"];
  mixComponents?: { materialId: string; qty: number }[];
  /** harga beli per kemasan */
  purchasePrice?: number;
  /** jumlah/isi per kemasan dalam satuan dasar */
  packSize?: number;
  /** hanya dipakai saat membuat bahan baru: stok awal */
  openingStock?: number;
}

const baseMaterialPayload = (m: RawMaterial) => ({
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

const mapMaterialRow = (m: RawMaterial) => ({
  ...baseMaterialPayload(m),
  material_type: m.materialType ?? "single",
  mix_components: Array.isArray(m.mixComponents) ? m.mixComponents : [],
});

async function upsertMaterialWithFallback(row: RawMaterial) {
  if (!supabase) throw new Error("Supabase tidak aktif");

  const typedPayload = mapMaterialRow(row);
  const legacyPayload = baseMaterialPayload(row);

  const attempts = [typedPayload, legacyPayload];

  let lastError: unknown = null;
  for (const payload of attempts) {
    const { error } = await supabase.from("materials").upsert(payload, { onConflict: "id" });
    if (!error) {
      return;
    }
    lastError = error;

    if (error.code !== "PGRST204" && !String(error.message).includes("column") && !String(error.message).includes("Could not find")) {
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gagal menyimpan bahan baku ke Supabase");
}

async function updateMaterialRemote(id: string, row: RawMaterial) {
  if (!supabase) throw new Error("Supabase tidak aktif");

  const typedPayload = mapMaterialRow(row);
  const legacyPayload = baseMaterialPayload(row);

  const attempts = [typedPayload, legacyPayload];

  let lastError: unknown = null;
  for (const payload of attempts) {
    const { error } = await supabase.from("materials").update(payload).eq("id", id);
    if (!error) {
      return;
    }
    lastError = error;

    if (error.code !== "PGRST204" && !String(error.message).includes("column") && !String(error.message).includes("Could not find")) {
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gagal memperbarui bahan baku di Supabase");
}

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
  materialType: row.material_type ?? "single",
  mixComponents: Array.isArray(row.mix_components)
    ? row.mix_components.map((item: any) => ({
        id: item.id ?? uid(),
        materialId: item.material_id ?? item.materialId,
        qty: Number(item.qty ?? 0),
      }))
    : [],
  isActive: row.is_active ? 1 : 0,
  createdAt: row.created_at ?? nowISO(),
  updatedAt: row.updated_at ?? nowISO(),
});

export async function createMaterial(input: MaterialInput) {
  assertPermission("materials.manage", "Hanya admin yang dapat menambah bahan baku.");
  const ts = nowISO();
  const id = uid();
  const opening = input.openingStock ?? 0;
  const materialType = input.materialType ?? "single";
  const mixComponents = (input.mixComponents ?? []).filter((item) => item.materialId && item.qty > 0);

  if (materialType === "mix" && mixComponents.length === 0) {
    throw new Error("Komposisi bahan campuran wajib diisi");
  }

  const row: RawMaterial = {
    id,
    name: input.name.trim(),
    supplier: input.supplier?.trim() || undefined,
    unit: input.unit,
    currentStock: opening,
    minStock: input.minStock,
    costPerUnit: input.costPerUnit,
    materialType,
    mixComponents: mixComponents.map((item) => ({ id: uid(), materialId: item.materialId, qty: item.qty })),
    ...(input.purchasePrice !== undefined ? { purchasePrice: input.purchasePrice } : {}),
    ...(input.packSize !== undefined ? { packSize: input.packSize } : {}),
    isActive: 1,
    createdAt: ts,
    updatedAt: ts,
  };

  if (isSupabaseEnabled && supabase) {
    await upsertMaterialWithFallback(row);

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
  assertPermission("materials.manage", "Hanya admin yang dapat mengubah bahan baku.");
  const ts = nowISO();
  const base = await db.materials.get(id);
  const materialType = input.materialType ?? base?.materialType ?? "single";
  const mixComponents = (input.mixComponents ?? base?.mixComponents ?? []).filter((item) => item.materialId && item.qty > 0);

  if (materialType === "mix" && mixComponents.length === 0) {
    throw new Error("Komposisi bahan campuran wajib diisi");
  }

  const row: RawMaterial = {
    ...(base ?? { id, currentStock: 0, isActive: 1, createdAt: ts, updatedAt: ts }),
    id,
    name: input.name.trim(),
    supplier: input.supplier?.trim() || base?.supplier || undefined,
    unit: input.unit,
    minStock: input.minStock,
    costPerUnit: input.costPerUnit,
    materialType,
    mixComponents: mixComponents.map((item) => ({ id: item.id ?? uid(), materialId: item.materialId, qty: item.qty })),
    ...(input.purchasePrice !== undefined ? { purchasePrice: input.purchasePrice } : {}),
    ...(input.packSize !== undefined ? { packSize: input.packSize } : {}),
    updatedAt: ts,
  };

  if (isSupabaseEnabled && supabase) {
    await updateMaterialRemote(id, row);
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
  assertPermission("materials.manage", "Hanya admin yang dapat mengarsipkan bahan baku.");
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
  assertPermission("materials.manage", "Hanya admin yang dapat mengaktifkan bahan baku.");
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
  assertPermission("materials.manage", "Hanya admin yang dapat mencatat perubahan stok bahan.");
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
