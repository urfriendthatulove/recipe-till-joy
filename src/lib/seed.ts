import { db } from "./db";

/**
 * Saat project sudah memakai Supabase, lokal harus bersih dan menjadi mirror dari cloud.
 * Jadi tidak ada seeding data dummy / contoh lagi.
 */
export async function seedIfEmpty() {
  const [materialCount, categoryCount, menuCount, recipeCount, saleCount, movementCount] = await Promise.all([
    db.materials.count(),
    db.categories.count(),
    db.menus.count(),
    db.recipes.count(),
    db.sales.count(),
    db.movements.count(),
  ]);

  if (
    materialCount === 0 &&
    categoryCount === 0 &&
    menuCount === 0 &&
    recipeCount === 0 &&
    saleCount === 0 &&
    movementCount === 0
  ) {
    return;
  }

  await db.transaction(
    "rw",
    db.materials,
    db.categories,
    db.menus,
    db.recipes,
    db.sales,
    db.movements,
    async () => {
      await db.movements.clear();
      await db.sales.clear();
      await db.recipes.clear();
      await db.menus.clear();
      await db.categories.clear();
      await db.materials.clear();
    },
  );
}

