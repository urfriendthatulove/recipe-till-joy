import { db, uid, type MenuCategory, type MenuItem, type RawMaterial, type RecipeItem, type Sale, type StockMovement } from "./db";
import { isSupabaseEnabled, supabase } from "./supabase";

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
  createdAt: row.created_at ?? new Date().toISOString(),
  updatedAt: row.updated_at ?? new Date().toISOString(),
});

const categoryFromSupabase = (row: any): MenuCategory => ({
  id: row.id,
  name: row.name,
  sortOrder: Number(row.sort_order ?? 0),
});

const menuFromSupabase = (row: any): MenuItem => ({
  id: row.id,
  code: row.code ?? undefined,
  name: row.name,
  categoryId: row.category_id,
  price: Number(row.price ?? 0),
  directCost: row.direct_cost ?? undefined,
  recipeNote: row.recipe_note ?? undefined,
  isActive: row.is_active ? 1 : 0,
  createdAt: row.created_at ?? new Date().toISOString(),
  updatedAt: row.updated_at ?? new Date().toISOString(),
});

const recipeFromSupabase = (row: any): RecipeItem => ({
  id: row.id,
  menuItemId: row.menu_id,
  materialId: row.material_id,
  qty: Number(row.qty ?? 0),
});

const saleFromSupabase = (row: any): Sale => ({
  id: row.id,
  saleNumber: row.sale_number,
  createdAt: row.created_at ?? new Date().toISOString(),
  items: Array.isArray(row.items) ? row.items : [],
  subtotal: Number(row.subtotal ?? 0),
  discount: Number(row.discount ?? 0),
  netSales: Number(row.net_sales ?? 0),
  totalCost: Number(row.total_cost ?? 0),
  profit: Number(row.profit ?? 0),
  paymentMethod: row.payment_method ?? "cash",
  note: row.note ?? undefined,
  voided: row.voided ? 1 : 0,
});

const movementFromSupabase = (row: any): StockMovement => ({
  id: row.id,
  materialId: row.material_id,
  type: row.type,
  qty: Number(row.qty ?? 0),
  balanceAfter: Number(row.balance_after ?? 0),
  unitCost: row.unit_cost ?? undefined,
  refType: row.ref_type ?? "manual",
  refId: row.ref_id ?? undefined,
  note: row.note ?? undefined,
  createdAt: row.created_at ?? new Date().toISOString(),
});

/**
 * Selalu sinkronkan mirror lokal dari Supabase saat fitur ini aktif.
 * Ini memastikan data yang dihapus di remote juga hilang dari UI lokal,
 * termasuk halaman laporan yang membaca database Dexie.
 */
export async function seedIfEmpty() {
  if (!isSupabaseEnabled || !supabase) {
    return;
  }

  const [{ data: materialsData }, { data: categoriesData }, { data: menusData }, { data: recipesData }, { data: salesData }, { data: movementsData }] = await Promise.all([
    supabase.from("materials").select("*"),
    supabase.from("menu_categories").select("*"),
    supabase.from("menus").select("*"),
    supabase.from("recipes").select("*"),
    supabase.from("sales").select("*"),
    supabase.from("stock_movements").select("*"),
  ]);

  const materialRows = (materialsData ?? []).map(materialFromSupabase);
  const categoryRows = (categoriesData ?? []).map(categoryFromSupabase);
  const menuRows = (menusData ?? []).map(menuFromSupabase);
  const recipeRows = (recipesData ?? []).map(recipeFromSupabase);
  const saleRows = (salesData ?? []).map(saleFromSupabase);
  const movementRows = (movementsData ?? []).map(movementFromSupabase);

  await db.transaction(
    "rw",
    ["materials", "categories", "menus", "recipes", "sales", "movements"],
    async () => {
      await db.movements.clear();
      await db.sales.clear();
      await db.recipes.clear();
      await db.menus.clear();
      await db.categories.clear();
      await db.materials.clear();

      if (materialRows.length) await db.materials.bulkPut(materialRows);
      if (categoryRows.length) await db.categories.bulkPut(categoryRows);
      if (menuRows.length) await db.menus.bulkPut(menuRows);
      if (recipeRows.length) await db.recipes.bulkPut(recipeRows);
      if (saleRows.length) await db.sales.bulkPut(saleRows);
      if (movementRows.length) await db.movements.bulkPut(movementRows);
    },
  );
}

