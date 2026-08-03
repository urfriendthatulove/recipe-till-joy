import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { db, type MenuItem } from "@/lib/db";
import { formatRp, formatRpPrecise, parseLocaleNumber } from "@/lib/format";
import { marginPercent, saveRecipe } from "@/lib/menus";

interface Row {
  key: string;
  materialId: string;
  qty: string;
}

const newRow = (): Row => ({
  key: Math.random().toString(36).slice(2),
  materialId: "",
  qty: "",
});

export function RecipeSheet({
  open,
  onOpenChange,
  menu,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  menu: MenuItem | null;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const materials = useLiveQuery(
    async () =>
      (await db.materials.where("isActive").equals(1).toArray()).sort((a, b) =>
        a.name.localeCompare(b.name, "id"),
      ),
    [],
    [],
  );

  const existing = useLiveQuery(
    async () => (menu ? db.recipes.where("menuItemId").equals(menu.id).toArray() : []),
    [menu?.id],
    [],
  );

  useEffect(() => {
    if (!open || !menu) return;
    const mapped = existing.map((r) => ({
      key: r.id,
      materialId: r.materialId,
      qty: String(r.qty),
    }));
    setRows(mapped.length ? mapped : [newRow()]);
    // hanya saat sheet dibuka / ganti menu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, menu?.id, existing.length]);

  const materialById = useMemo(
    () => new Map(materials.map((m) => [m.id, m])),
    [materials],
  );

  const hpp = useMemo(() => {
    const fromRecipe = rows.reduce((sum, r) => {
      const mat = materialById.get(r.materialId);
      return sum + (mat ? parseLocaleNumber(r.qty) * mat.costPerUnit : 0);
    }, 0);
    return fromRecipe + (menu?.directCost ?? 0);
  }, [rows, materialById, menu]);

  const price = menu?.price ?? 0;
  const margin = marginPercent(price, hpp);

  async function handleSave() {
    if (!menu) return;
    const ids = rows.filter((r) => r.materialId).map((r) => r.materialId);
    if (new Set(ids).size !== ids.length) {
      toast.error("Ada bahan yang dipilih dua kali — gabungkan takarannya");
      return;
    }
    setSaving(true);
    try {
      await saveRecipe(
        menu.id,
        rows.map((r) => ({ materialId: r.materialId, qty: parseLocaleNumber(r.qty) })),
      );
      toast.success(`Resep ${menu.name} tersimpan`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan resep");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Resep — {menu?.name}</SheetTitle>
          <SheetDescription>
            Takaran per 1 porsi, dalam satuan dasar bahan. Stok akan berkurang otomatis saat menu ini
            terjual.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {rows.map((row, i) => {
            const mat = materialById.get(row.materialId);
            const lineCost = mat ? parseLocaleNumber(row.qty) * mat.costPerUnit : 0;
            return (
              <div key={row.key} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-end gap-2">
                  <div className="grid flex-1 gap-1.5">
                    <Label className="text-xs">Bahan {i + 1}</Label>
                    <Select
                      value={row.materialId}
                      onValueChange={(v) =>
                        setRows((prev) =>
                          prev.map((r) => (r.key === row.key ? { ...r, materialId: v } : r)),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih bahan" />
                      </SelectTrigger>
                      <SelectContent>
                        {materials.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} ({m.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid w-28 gap-1.5">
                    <Label className="text-xs">Takaran{mat ? ` (${mat.unit})` : ""}</Label>
                    <Input
                      inputMode="decimal"
                      value={row.qty}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, qty: e.target.value } : r,
                          ),
                        )
                      }
                      placeholder="150"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    aria-label="Hapus bahan"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {mat ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatRpPrecise(mat.costPerUnit)}/{mat.unit} → biaya baris{" "}
                    <span className="font-medium text-foreground">{formatRp(lineCost)}</span>
                  </p>
                ) : null}
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setRows((prev) => [...prev, newRow()])}
          >
            <Plus className="size-4" /> Tambah bahan
          </Button>
        </div>

        <div className="space-y-3 border-t border-border bg-card px-4 py-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Harga jual</p>
              <p className="font-semibold">{formatRp(price)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">HPP</p>
              <p className="font-semibold">{formatRp(hpp)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Margin</p>
              <p
                className={
                  margin < 50 ? "font-semibold text-destructive" : "font-semibold text-primary"
                }
              >
                {margin.toFixed(1)}%
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan resep"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
