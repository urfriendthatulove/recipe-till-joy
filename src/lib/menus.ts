import { db, nowISO, uid, type MenuItem, type RawMaterial, type RecipeItem } from "./db";

export interface MenuInput {
  code?: string;
  name: string;
  categoryId: string;
  price: number;
  directCost?: number;
}

export async function createMenu(input: MenuInput) {
  const ts = nowISO();
  const id = uid();
  const item: MenuItem = {
    id,
    name: input.name.trim(),
    categoryId: input.categoryId,
    price: input.price,
    isActive: 1,
    createdAt: ts,
    updatedAt: ts,
  };
  if (input.code?.trim()) item.code = input.code.trim().toUpperCase();
  if (input.directCost !== undefined) item.directCost = input.directCost;
  await db.menus.add(item);
  return id;
}

export async function updateMenu(id: string, input: MenuInput) {
  await db.menus.update(id, {
    code: input.code?.trim().toUpperCase() || undefined,
    name: input.name.trim(),
    categoryId: input.categoryId,
    price: input.price,
    directCost: input.directCost ?? 0,
    updatedAt: nowISO(),
  });
}

export async function archiveMenu(id: string) {
  await db.menus.update(id, { isActive: 0, updatedAt: nowISO() });
}

export async function restoreMenu(id: string) {
  await db.menus.update(id, { isActive: 1, updatedAt: nowISO() });
}

/** Hapus menu permanen hanya boleh kalau belum pernah terjual — di sini cukup arsip. */

export async function createCategory(name: string) {
  const count = await db.categories.count();
  const id = uid();
  await db.categories.add({ id, name: name.trim(), sortOrder: count });
  return id;
}

export async function renameCategory(id: string, name: string) {
  await db.categories.update(id, { name: name.trim() });
}

export async function deleteCategory(id: string) {
  const used = await db.menus.where("categoryId").equals(id).count();
  if (used > 0) throw new Error("Kategori masih dipakai oleh menu lain");
  await db.categories.delete(id);
}

/** Simpan seluruh baris resep untuk satu menu (replace-all, transaksional). */
export async function saveRecipe(menuItemId: string, rows: { materialId: string; qty: number }[]) {
  const clean = rows.filter((r) => r.materialId && r.qty > 0);
  await db.transaction("rw", db.recipes, async () => {
    const existing = await db.recipes.where("menuItemId").equals(menuItemId).toArray();
    await db.recipes.bulkDelete(existing.map((r) => r.id));
    const items: RecipeItem[] = clean.map((r) => ({
      id: uid(),
      menuItemId,
      materialId: r.materialId,
      qty: r.qty,
    }));
    if (items.length) await db.recipes.bulkAdd(items);
  });
}

/** HPP satu menu = total (qty bahan × harga pokok bahan) + directCost. */
export function computeCost(
  menu: MenuItem,
  recipes: RecipeItem[],
  materialById: Map<string, RawMaterial>,
) {
  const fromRecipe = recipes
    .filter((r) => r.menuItemId === menu.id)
    .reduce((sum, r) => sum + r.qty * (materialById.get(r.materialId)?.costPerUnit ?? 0), 0);
  return fromRecipe + (menu.directCost ?? 0);
}

export const marginPercent = (price: number, cost: number) =>
  price > 0 ? ((price - cost) / price) * 100 : 0;
