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

const CATEGORIES = [
  "Classic Coffee",
  "Kopi 15rb",
  "Milky Series",
  "Signature Drinks",
  "Tea",
  "Mineral Water",
  "Nasi",
  "Mie",
  "Rice Bowl",
  "Snacks",
];

/** [kode, nama, kategori, harga] — diambil dari laporan penjualan lama */
const MENUS: [string, string, string, number][] = [
  ["CLSC002", "Americano", "Classic Coffee", 15652],
  ["CLSC004", "Latte", "Classic Coffee", 21739],
  ["15RB001", "Kesukaan Rakyat 15RB", "Kopi 15rb", 13043],
  ["15RB002", "Arennya Rakyat 15RB", "Kopi 15rb", 13043],
  ["MLKY002", "Milo Dinosaurus", "Milky Series", 24348],
  ["MLKY004", "Chocolate Milk", "Milky Series", 25217],
  ["MLKY005", "Matcha Latte", "Milky Series", 25217],
  ["SGNTR001", "Kesukaan Rakyat (Salted Aren)", "Signature Drinks", 21739],
  ["TEA001", "Regular Tea", "Tea", 14783],
  ["TEA002", "Lemon Tea", "Tea", 20000],
  ["TEA003", "Lychee Tea", "Tea", 20000],
  ["BEV049", "Mineral Water 330ml", "Mineral Water", 8000],
  ["FOD002", "Nasi Goreng Ayam", "Nasi", 38000],
  ["FOD007", "Mie Goreng Jawa", "Mie", 45000],
  ["FOD019", "Nasi Telor w/ Chicken", "Rice Bowl", 35000],
  ["FOD020", "Nasi Telor w/ Beef", "Rice Bowl", 38000],
  ["FOD026", "Ebi Tempura", "Snacks", 45000],
  ["FOD029", "French Fries", "Snacks", 35000],
  ["FOD031", "Pisang Goreng", "Snacks", 30000],
];

export async function seedIfEmpty() {
  const count = await db.materials.count();
  if (count > 0) return false;

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

  const categories: MenuCategory[] = CATEGORIES.map((name, i) => ({
    id: uid(),
    name,
    sortOrder: i,
  }));
  const catByName = new Map(categories.map((c) => [c.name, c.id]));

  const menus: MenuItem[] = MENUS.map(([code, name, cat, price]) => ({
    id: uid(),
    code,
    name,
    categoryId: catByName.get(cat)!,
    price,
    isActive: 1,
    createdAt: ts,
    updatedAt: ts,
  }));

  await db.transaction("rw", db.materials, db.categories, db.menus, async () => {
    await db.materials.bulkAdd(materials);
    await db.categories.bulkAdd(categories);
    await db.menus.bulkAdd(menus);
  });

  return true;
}
