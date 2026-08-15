import { MENU_CATEGORIES, MENU_DATA } from "@/data/menuData";

import { db, nowISO, uid, type MenuCategory, type MenuItem, type RawMaterial } from "./db";

/**
 * Seed data awal — HANYA contoh, bisa diedit/dihapus sepenuhnya oleh pengguna.
 * Hanya diisi sekali saat database masih kosong.
 */

/** [nama, satuan dasar, harga beli per kemasan, jumlah/isi per kemasan] */
type MaterialSeed = [name: string, unit: RawMaterial["unit"], purchasePrice: number, packSize: number];

const MATERIALS: MaterialSeed[] = [
  ["Kopi", "g", 140000, 1000],
  ["Susu", "ml", 18025, 1000],
  ["FN Evaporasi", "ml", 16667, 380],
  ["Salted Caramel", "ml", 88800, 1000],
  ["Gula Aren", "ml", 70000, 1300],
  ["Cup", "pcs", 900, 1],
  ["Es Batu", "g", 25000, 20000],
  ["SKM", "ml", 14000, 365],
  ["Butter Powder", "g", 82000, 500],
  ["Gula Putih", "g", 18000, 1000],
  ["Aqua", "ml", 25000, 19000],
  ["Oreo", "pcs", 0, 48],
  ["All Syrup Delifru", "ml", 125000, 1000],
  ["Powder Matcha", "g", 133200, 1000],
  ["Oatside", "ml", 39000, 1000],
  ["Regal", "g", 25000, 230],
  ["Dilmah Tea", "pcs", 190000, 20],
  ["Lychee Can", "g", 30000, 567],
  ["Milo Powder", "g", 98235, 990],
  ["Oreo Kemasan", "pcs", 12000, 13],
  ["Paper Filter", "pcs", 35900, 100],
  ["Banana Fruit", "g", 27000, 650],
  ["Strawberry Frozen", "g", 13000, 200],
  ["Yougurth", "g", 33744, 500],
  ["Chocolate", "g", 116550, 1000],
  ["Frappe Based", "g", 133200, 1000],
  ["Whip Cream", "ml", 72816, 1000],
];

const MATERIAL_SEED_VERSION = "bahan-baku-2026-08-15";
const MATERIAL_SEED_KEY = "quinos-material-seed-version";

const MENU_SEED_VERSION = "menu-2026-08-14";
const MENU_SEED_KEY = "quinos-menu-seed-version";

/** Isi ulang katalog menu + kategori dari data awal (85 item) sekali per versi seed. */
async function seedMenuCatalog() {
  if (typeof localStorage !== "undefined" && localStorage.getItem(MENU_SEED_KEY) === MENU_SEED_VERSION) {
    return false;
  }

  const ts = nowISO();
  const categories: MenuCategory[] = MENU_CATEGORIES.map((name, i) => ({
    id: uid(),
    name,
    sortOrder: i,
  }));
  const catByName = new Map(categories.map((c) => [c.name, c.id]));

  const menus: MenuItem[] = MENU_DATA.map((row) => {
    const item: MenuItem = {
      id: uid(),
      code: row.code,
      name: row.name,
      categoryId: catByName.get(row.category)!,
      price: row.price,
      isActive: row.is_archived ? 0 : 1,
      createdAt: ts,
      updatedAt: ts,
    };
    if (row.recipe) item.recipeNote = row.recipe;
    if (row.cost) item.directCost = row.cost;
    return item;
  });

  await db.transaction("rw", db.categories, db.menus, db.recipes, async () => {
    await db.recipes.clear();
    await db.menus.clear();
    await db.categories.clear();
    await db.categories.bulkAdd(categories);
    await db.menus.bulkAdd(menus);
  });

  if (typeof localStorage !== "undefined") localStorage.setItem(MENU_SEED_KEY, MENU_SEED_VERSION);
  return true;
}

export async function seedIfEmpty() {
  const seededMenus = await seedMenuCatalog();

  const seededVersion =
    typeof localStorage !== "undefined" ? localStorage.getItem(MATERIAL_SEED_KEY) : MATERIAL_SEED_VERSION;
  const count = await db.materials.count();
  if (count > 0 && seededVersion === MATERIAL_SEED_VERSION) return seededMenus;

  const ts = nowISO();

  const materials: RawMaterial[] = MATERIALS.map(([name, unit, purchasePrice, packSize]) => ({
    id: uid(),
    name,
    unit,
    currentStock: packSize,
    minStock: Math.round(packSize * 0.2),
    purchasePrice,
    packSize,
    costPerUnit: packSize > 0 ? purchasePrice / packSize : 0,
    isActive: 1,
    createdAt: ts,
    updatedAt: ts,
  }));

  await db.transaction("rw", db.materials, db.movements, async () => {
    await db.movements.clear();
    await db.materials.clear();
    await db.materials.bulkAdd(materials);
  });

  if (typeof localStorage !== "undefined") localStorage.setItem(MATERIAL_SEED_KEY, MATERIAL_SEED_VERSION);

  return true;
}
