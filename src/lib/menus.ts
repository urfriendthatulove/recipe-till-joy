import { db, nowISO, uid, type MenuItem, type RawMaterial, type RecipeItem } from "./db";
import { assertPermission } from "./auth";
import { isSupabaseEnabled, supabase } from "./supabase";

export interface MenuInput {
  code?: string;
  name: string;
  categoryId: string;
  price: number;
  directCost?: number;
}

export async function createMenu(input: MenuInput) {
  assertPermission("menus.manage", "Hanya admin yang dapat menambah menu.");
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

  const client = supabase;
  if (client) {
    const { error } = await client.from("menus").upsert({
      id: item.id,
      code: item.code ?? null,
      name: item.name,
      category_id: item.categoryId,
      price: item.price,
      direct_cost: item.directCost ?? null,
      recipe_note: item.recipeNote ?? null,
      is_active: true,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    }, { onConflict: "id" });
    if (error) throw error;
    await db.menus.put(item);
    return id;
  }

  await db.menus.add(item);
  return id;
}

export async function updateMenu(id: string, input: MenuInput) {
  assertPermission("menus.manage", "Hanya admin yang dapat mengubah menu.");
  const ts = nowISO();
  const client = supabase;
  if (client) {
    const { error } = await client.from("menus").update({
      code: input.code?.trim().toUpperCase() ?? "",
      name: input.name.trim(),
      category_id: input.categoryId,
      price: input.price,
      direct_cost: input.directCost ?? 0,
      updated_at: ts,
    }).eq("id", id);
    if (error) throw error;
    const existing = await db.menus.get(id);
    if (existing) {
      await db.menus.put({ ...existing, code: input.code?.trim().toUpperCase() ?? "", name: input.name.trim(), categoryId: input.categoryId, price: input.price, directCost: input.directCost ?? 0, updatedAt: ts });
    }
    return;
  }

  await db.menus.update(id, {
    code: input.code?.trim().toUpperCase() ?? "",
    name: input.name.trim(),
    categoryId: input.categoryId,
    price: input.price,
    directCost: input.directCost ?? 0,
    updatedAt: nowISO(),
  });
}

export async function archiveMenu(id: string) {
  assertPermission("menus.manage", "Hanya admin yang dapat mengarsipkan menu.");
  const ts = nowISO();
  const client = supabase;
  if (client) {
    const { error } = await client.from("menus").update({ is_active: false, updated_at: ts }).eq("id", id);
    if (error) throw error;
    const current = await db.menus.get(id);
    if (current) await db.menus.put({ ...current, isActive: 0, updatedAt: ts });
    return;
  }
  await db.menus.update(id, { isActive: 0, updatedAt: ts });
}

export async function restoreMenu(id: string) {
  assertPermission("menus.manage", "Hanya admin yang dapat mengaktifkan menu.");
  const ts = nowISO();
  const client = supabase;
  if (client) {
    const { error } = await client.from("menus").update({ is_active: true, updated_at: ts }).eq("id", id);
    if (error) throw error;
    const current = await db.menus.get(id);
    if (current) await db.menus.put({ ...current, isActive: 1, updatedAt: ts });
    return;
  }
  await db.menus.update(id, { isActive: 1, updatedAt: ts });
}

export async function createCategory(name: string) {
  assertPermission("menus.manage", "Hanya admin yang dapat menambah kategori.");
  const count = await db.categories.count();
  const id = uid();
  const row = { id, name: name.trim(), sortOrder: count, createdAt: nowISO() };

  const client = supabase;
  if (client) {
    const { error } = await client.from("menu_categories").upsert({
      id: row.id,
      name: row.name,
      sort_order: row.sortOrder,
      created_at: row.createdAt,
    }, { onConflict: "id" });
    if (error) throw error;
    await db.categories.put(row);
    return id;
  }

  await db.categories.add(row);
  return id;
}

export async function renameCategory(id: string, name: string) {
  assertPermission("menus.manage", "Hanya admin yang dapat mengubah kategori.");
  const client = supabase;
  if (client) {
    const { error } = await client.from("menu_categories").update({ name: name.trim() }).eq("id", id);
    if (error) throw error;
    const current = await db.categories.get(id);
    if (current) await db.categories.put({ ...current, name: name.trim() });
    return;
  }
  await db.categories.update(id, { name: name.trim() });
}

export async function deleteCategory(id: string) {
  assertPermission("menus.manage", "Hanya admin yang dapat menghapus kategori.");
  const used = await db.menus.where("categoryId").equals(id).count();
  if (used > 0) throw new Error("Kategori masih dipakai oleh menu lain");

  const client = supabase;
  if (client) {
    const { error } = await client.from("menu_categories").delete().eq("id", id);
    if (error) throw error;
    await db.categories.delete(id);
    return;
  }

  await db.categories.delete(id);
}

export async function saveRecipe(menuItemId: string, rows: { materialId: string; qty: number }[]) {
  assertPermission("menus.manage", "Hanya admin yang dapat menyimpan resep.");
  const clean = rows.filter((r) => r.materialId && r.qty > 0);

  const client = supabase;
  if (client) {
    const existing = await db.recipes.where("menuItemId").equals(menuItemId).toArray();
    await Promise.all(existing.map((row) => client.from("recipes").delete().eq("id", row.id)));
    await db.recipes.bulkDelete(existing.map((row) => row.id));

    const items: RecipeItem[] = clean.map((r) => ({
      id: uid(),
      menuItemId,
      materialId: r.materialId,
      qty: r.qty,
    }));

    await Promise.all(items.map(async (item) => {
      const { error } = await client.from("recipes").upsert({
        id: item.id,
        menu_id: item.menuItemId,
        material_id: item.materialId,
        qty: item.qty,
        created_at: nowISO(),
      }, { onConflict: "id" });
      if (error) throw error;
    }));

    await db.recipes.bulkPut(items);
    return;
  }

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
