import { MENU_CATEGORIES, MENU_DATA } from "@/data/menuData";

import { db, nowISO, uid, type MenuCategory, type MenuItem, type RawMaterial } from "./db";

/**
 * Seed data awal — HANYA contoh, bisa diedit/dihapus sepenuhnya oleh pengguna.
 * Hanya diisi sekali saat database masih kosong.
 */

type MaterialSeed = [name: string, unit: RawMaterial["unit"], stock: number, min: number, cost: number];

const MATERIALS: MaterialSeed[] = [
  ["Susu UHT Full Cream", "ml", 12000, 3000, 18],
  ["Biji Kopi Arabika", "g", 2000, 500, 200],
  ["Gula Aren Cair", "ml", 3000, 800, 30],
  ["Gula Cair", "ml", 3000, 800, 12],
  ["Bubuk Matcha", "g", 500, 150, 400],
  ["Bubuk Coklat", "g", 800, 200, 150],
  ["Bubuk Milo", "g", 1000, 250, 120],
  ["Teh Celup", "pcs", 200, 50, 800],
  ["Sirup Lemon", "ml", 1500, 400, 45],
  ["Sirup Lychee", "ml", 1500, 400, 45],
  ["Es Batu", "g", 20000, 5000, 1],
  ["Gelas Plastik 16oz", "pcs", 500, 100, 1200],
  ["Tutup Gelas", "pcs", 500, 100, 400],
  ["Sedotan", "pcs", 500, 100, 150],
  ["Air Mineral 330ml", "pcs", 48, 12, 3000],
  ["Beras", "g", 25000, 5000, 14],
  ["Telur Ayam", "pcs", 60, 15, 2500],
  ["Ayam Fillet", "g", 3000, 800, 45],
  ["Daging Sapi Slice", "g", 2000, 600, 120],
  ["Mie Telur", "g", 2000, 500, 25],
  ["Kentang Beku", "g", 5000, 1000, 30],
  ["Ebi Tempura Beku", "pcs", 40, 10, 4000],
  ["Pisang", "pcs", 30, 10, 2000],
  ["Minyak Goreng", "ml", 5000, 1000, 20],
];

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

  const count = await db.materials.count();
  if (count > 0) return seededMenus;

  const ts = nowISO();


  const materials: RawMaterial[] = MATERIALS.map(([name, unit, currentStock, minStock, costPerUnit]) => ({
    id: uid(),
    name,
    unit,
    currentStock,
    minStock,
    costPerUnit,
    isActive: 1,
    createdAt: ts,
    updatedAt: ts,
  }));

  await db.materials.bulkAdd(materials);

  return true;
}
