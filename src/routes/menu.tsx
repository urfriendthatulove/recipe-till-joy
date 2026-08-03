import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Archive, ChefHat, Pencil, Plus, Search, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { MenuFormDialog } from "@/components/menu/MenuFormDialog";
import { RecipeSheet } from "@/components/menu/RecipeSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db, type MenuItem } from "@/lib/db";
import { formatRp } from "@/lib/format";
import { archiveMenu, computeCost, marginPercent, restoreMenu } from "@/lib/menus";
import { seedIfEmpty } from "@/lib/seed";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu & Resep — Quinos POS Coffee Shop" },
      {
        name: "description",
        content:
          "Kelola daftar menu, harga jual, dan resep (BOM) tiap menu agar HPP serta margin terhitung otomatis.",
      },
      { property: "og:title", content: "Menu & Resep — Quinos POS Coffee Shop" },
      {
        property: "og:description",
        content: "Atur resep tiap menu supaya stok bahan berkurang otomatis saat penjualan.",
      },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedIfEmpty()
      .then(() => setReady(true))
      .catch((e) => {
        console.error(e);
        toast.error("Gagal membuka database lokal");
      });
  }, []);

  if (!ready) {
    return (
      <AppShell title="Menu & Resep">
        <p className="text-sm text-muted-foreground">Memuat data lokal…</p>
      </AppShell>
    );
  }
  return <MenuView />;
}

function MenuView() {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [selected, setSelected] = useState<MenuItem | null>(null);

  const menus = useLiveQuery(async () => db.menus.toArray(), [], []);
  const categories = useLiveQuery(
    async () => (await db.categories.toArray()).sort((a, b) => a.sortOrder - b.sortOrder),
    [],
    [],
  );
  const materials = useLiveQuery(async () => db.materials.toArray(), [], []);
  const recipes = useLiveQuery(async () => db.recipes.toArray(), [], []);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menus
      .filter((m) => (showArchived ? m.isActive === 0 : m.isActive === 1))
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          (m.code ?? "").toLowerCase().includes(q) ||
          (catById.get(m.categoryId)?.name ?? "").toLowerCase().includes(q),
      )
      .map((m) => {
        const recipeCount = recipes.filter((r) => r.menuItemId === m.id).length;
        const cost = computeCost(m, recipes, materialById);
        return { menu: m, recipeCount, cost, margin: marginPercent(m.price, cost) };
      })
      .sort((a, b) => {
        const ca = catById.get(a.menu.categoryId)?.sortOrder ?? 999;
        const cb = catById.get(b.menu.categoryId)?.sortOrder ?? 999;
        return ca - cb || a.menu.name.localeCompare(b.menu.name, "id");
      });
  }, [menus, recipes, materialById, catById, query, showArchived]);

  const activeMenus = menus.filter((m) => m.isActive === 1);
  const withoutRecipe = activeMenus.filter(
    (m) => !recipes.some((r) => r.menuItemId === m.id) && !m.directCost,
  );

  return (
    <AppShell
      title="Menu & Resep"
      description="Atur harga jual dan takaran bahan tiap menu. HPP dan margin dihitung otomatis dari harga pokok bahan baku."
      actions={
        <Button
          onClick={() => {
            setSelected(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" /> Tambah menu
        </Button>
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Menu aktif" value={String(activeMenus.length)} />
        <StatCard label="Kategori" value={String(categories.length)} />
        <StatCard
          label="Belum punya resep"
          value={String(withoutRecipe.length)}
          tone={withoutRecipe.length ? "warn" : "default"}
        />
      </div>

      {withoutRecipe.length ? (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium">
            {withoutRecipe.length} menu belum punya resep — penjualannya tidak akan mengurangi stok.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {withoutRecipe.slice(0, 8).map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelected(m);
                  setRecipeOpen(true);
                }}
              >
                {m.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari menu, kode, atau kategori…"
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          Tampilkan arsip
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Menu</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead className="text-right">Harga</TableHead>
              <TableHead className="text-right">HPP</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Belum ada menu yang cocok.
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ menu, recipeCount, cost, margin }) => (
                <TableRow key={menu.id}>
                  <TableCell>
                    <div className="font-medium">{menu.name}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {menu.code ? <span>{menu.code}</span> : null}
                      {recipeCount ? (
                        <span>{recipeCount} bahan</span>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/50 text-amber-700">
                          tanpa resep
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {catById.get(menu.categoryId)?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{formatRp(menu.price)}</TableCell>
                  <TableCell className="text-right">{formatRp(cost)}</TableCell>
                  <TableCell
                    className={`text-right ${cost > 0 && margin < 50 ? "text-destructive" : ""}`}
                  >
                    {cost > 0 ? `${margin.toFixed(0)}%` : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelected(menu);
                          setRecipeOpen(true);
                        }}
                      >
                        <ChefHat className="size-4" /> Resep
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit menu"
                        onClick={() => {
                          setSelected(menu);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={menu.isActive ? "Arsipkan menu" : "Aktifkan menu"}
                        onClick={async () => {
                          if (menu.isActive) {
                            await archiveMenu(menu.id);
                            toast.success(`${menu.name} diarsipkan`);
                          } else {
                            await restoreMenu(menu.id);
                            toast.success(`${menu.name} diaktifkan`);
                          }
                        }}
                      >
                        {menu.isActive ? (
                          <Archive className="size-4" />
                        ) : (
                          <Undo2 className="size-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <MenuFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        menu={selected}
        categories={categories}
      />
      <RecipeSheet open={recipeOpen} onOpenChange={setRecipeOpen} menu={selected} />
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-semibold ${
          tone === "warn" ? "text-amber-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
