import Dexie, { type Table } from "dexie";

/* ============================================================
 * Satuan dasar penyimpanan stok.
 * Semua stok disimpan dalam satuan terkecil (ml / g / pcs)
 * supaya perhitungan resep tidak pernah salah konversi.
 * ============================================================ */
export type BaseUnit = "ml" | "g" | "pcs";

export const BASE_UNIT_LABEL: Record<BaseUnit, string> = {
  ml: "mililiter (ml)",
  g: "gram (g)",
  pcs: "pcs / buah",
};

/** Satuan yang boleh dipakai saat input restock, beserta pengalinya ke satuan dasar. */
export const INPUT_UNITS: Record<BaseUnit, { label: string; factor: number }[]> = {
  ml: [
    { label: "ml", factor: 1 },
    { label: "liter", factor: 1000 },
  ],
  g: [
    { label: "gram", factor: 1 },
    { label: "kg", factor: 1000 },
  ],
  pcs: [{ label: "pcs", factor: 1 }],
};

export interface RawMaterial {
  id: string;
  name: string;
  supplier?: string;
  unit: BaseUnit;
  currentStock: number;
  minStock: number;
  /** Harga beli per kemasan, mis. Rp 140.000 / 1000 g kopi */
  purchasePrice?: number;
  /** Jumlah / isi per kemasan dalam satuan dasar */
  packSize?: number;
  /** Rp per satuan dasar, mis. Rp 18 per ml susu */
  costPerUnit: number;
  isActive: number; // 1 | 0 (Dexie tidak bisa index boolean)
  createdAt: string;
  updatedAt: string;
}

export type MovementType = "in" | "out" | "adjustment" | "waste";
export type MovementRef = "purchase" | "sale" | "manual";

export interface StockMovement {
  id: string;
  materialId: string;
  type: MovementType;
  /** selalu positif; arah ditentukan oleh `type` */
  qty: number;
  /** stok sesudah pergerakan ini — memudahkan audit */
  balanceAfter: number;
  unitCost?: number;
  refType: MovementRef;
  refId?: string;
  note?: string;
  createdAt: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  code?: string;
  name: string;
  categoryId: string;
  price: number;
  /** biaya langsung untuk item tanpa resep (mis. snack kemasan) */
  directCost?: number;
  /** catatan resep berbentuk teks (dari data awal / SOP barista) */
  recipeNote?: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeItem {
  id: string;
  menuItemId: string;
  materialId: string;
  /** dalam satuan dasar bahan */
  qty: number;
}

export interface SaleItem {
  id: string;
  menuItemId: string;
  nameSnapshot: string;
  priceSnapshot: number;
  qty: number;
  discount: number;
  lineNet: number;
  lineCost: number;
}

export interface Sale {
  id: string;
  saleNumber: string;
  createdAt: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  netSales: number;
  totalCost: number;
  profit: number;
  paymentMethod: "cash" | "qris" | "transfer";
  note?: string;
  voided: number;
}

class QuinosDB extends Dexie {
  materials!: Table<RawMaterial, string>;
  movements!: Table<StockMovement, string>;
  categories!: Table<MenuCategory, string>;
  menus!: Table<MenuItem, string>;
  recipes!: Table<RecipeItem, string>;
  sales!: Table<Sale, string>;

  constructor() {
    super("quinos-pos");
    const schema = {
      materials: "id, name, isActive",
      movements: "id, materialId, createdAt, refId, type",
      categories: "id, sortOrder",
      menus: "id, code, categoryId, isActive",
      recipes: "id, menuItemId, materialId",
      sales: "id, createdAt, voided",
    };
    this.version(1).stores(schema);
    this.version(2).stores(schema);
    this.version(3).stores(schema);
  }
}

export const db = new QuinosDB();

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const nowISO = () => new Date().toISOString();
