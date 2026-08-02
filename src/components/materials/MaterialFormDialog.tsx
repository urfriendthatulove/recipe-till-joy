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
import { BASE_UNIT_LABEL, type BaseUnit, type RawMaterial } from "@/lib/db";
import { formatRpPrecise, parseLocaleNumber } from "@/lib/format";
import { createMaterial, updateMaterial, type MaterialInput } from "@/lib/materials";

const UNITS: BaseUnit[] = ["ml", "g", "pcs"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = mode tambah */
  material: RawMaterial | null;
}

export function MaterialFormDialog({ open, onOpenChange, material }: Props) {
  const isEdit = !!material;
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<BaseUnit>("ml");
  const [minStock, setMinStock] = useState("");
  const [cost, setCost] = useState("");
  const [opening, setOpening] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(material?.name ?? "");
    setUnit(material?.unit ?? "ml");
    setMinStock(material ? String(material.minStock) : "");
    setCost(material ? String(material.costPerUnit) : "");
    setOpening("");
  }, [open, material]);

  const costValue = parseLocaleNumber(cost);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Nama bahan wajib diisi");
      return;
    }
    if (costValue < 0) {
      toast.error("Harga tidak boleh negatif");
      return;
    }


    const payload: MaterialInput = {
      name,
      unit,
      minStock: parseLocaleNumber(minStock),
      costPerUnit: costValue,
    };

    setSaving(true);
    try {
      if (material) {
        await updateMaterial(material.id, payload);
        toast.success(`${payload.name} diperbarui`);
      } else {
        await createMaterial({ ...payload, openingStock: parseLocaleNumber(opening) });
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
            <DialogTitle>{isEdit ? "Edit Bahan Baku" : "Tambah Bahan Baku"}</DialogTitle>
            <DialogDescription>
              Stok disimpan dalam satuan terkecil agar takaran resep selalu akurat.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nama bahan</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Susu UHT Full Cream"
                autoFocus
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Satuan dasar</Label>
                <Select value={unit} onValueChange={(v) => setUnit(v as BaseUnit)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {BASE_UNIT_LABEL[u]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="min">Stok minimum ({unit})</Label>
                <Input
                  id="min"
                  inputMode="decimal"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  placeholder="3000"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cost">Harga pokok per {unit}</Label>
              <Input
                id="cost"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="18"
              />
              <p className="text-xs text-muted-foreground">
                {formatRpPrecise(costValue)} / {unit}
                {unit !== "pcs"
                  ? ` — setara ${formatRpPrecise(costValue * 1000)} per ${unit === "ml" ? "liter" : "kg"}`
                  : ""}
                . Dipakai untuk menghitung HPP & profit tiap menu.
              </p>
            </div>

            {!isEdit ? (
              <div className="grid gap-2">
                <Label htmlFor="opening">Stok awal ({unit})</Label>
                <Input
                  id="opening"
                  inputMode="decimal"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  placeholder="0"
                />
              </div>
            ) : null}
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
