import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MenuCategory, MenuItem } from "@/lib/db";
import { formatRp, parseLocaleNumber } from "@/lib/format";
import { createMenu, updateMenu, type MenuInput } from "@/lib/menus";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = mode tambah */
  menu: MenuItem | null;
  categories: MenuCategory[];
}

export function MenuFormDialog({ open, onOpenChange, menu, categories }: Props) {
  const isEdit = !!menu;
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [directCost, setDirectCost] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(menu?.code ?? "");
    setName(menu?.name ?? "");
    setCategoryId(menu?.categoryId ?? categories[0]?.id ?? "");
    setPrice(menu ? String(menu.price) : "");
    setDirectCost(menu?.directCost ? String(menu.directCost) : "");
  }, [open, menu, categories]);

  const priceValue = parseLocaleNumber(price);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Nama menu wajib diisi");
      return;
    }
    if (!categoryId) {
      toast.error("Pilih kategori dulu");
      return;
    }

    const payload: MenuInput = {
      code,
      name,
      categoryId,
      price: priceValue,
      directCost: parseLocaleNumber(directCost),
    };

    setSaving(true);
    try {
      if (menu) {
        await updateMenu(menu.id, payload);
        toast.success(`${payload.name} diperbarui`);
      } else {
        await createMenu(payload);
        toast.success(`${payload.name} ditambahkan`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Menu" : "Tambah Menu"}</DialogTitle>
            <DialogDescription>
              Harga jual dipakai di kasir. HPP dihitung otomatis dari resep bahan baku.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <div className="grid gap-2">
                <Label htmlFor="code">Kode (opsional)</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="CLSC002"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="menu-name">Nama menu</Label>
                <Input
                  id="menu-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Americano"
                  autoFocus
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Kategori</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="price">Harga jual</Label>
                <Input
                  id="price"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="21739"
                />
                <p className="text-xs text-muted-foreground">{formatRp(priceValue)}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="direct">Biaya langsung (opsional)</Label>
                <Input
                  id="direct"
                  inputMode="decimal"
                  value={directCost}
                  onChange={(e) => setDirectCost(e.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Untuk item tanpa resep, mis. snack kemasan beli jadi.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
