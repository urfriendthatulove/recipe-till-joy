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
  const [buyPrice, setBuyPrice] = useState("");
  const [packSize, setPackSize] = useState("");
  const [opening, setOpening] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(material?.name ?? "");
    setUnit(material?.unit ?? "ml");
    setMinStock(material ? String(material.minStock) : "");
    setBuyPrice(material?.purchasePrice ? String(material.purchasePrice) : "");
    setPackSize(material?.packSize ? String(material.packSize) : "");
    setOpening("");
  }, [open, material]);

  const buyValue = parseLocaleNumber(buyPrice);
  const packValue = parseLocaleNumber(packSize);
  const costValue = packValue > 0 ? buyValue / packValue : (material?.costPerUnit ?? 0);

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
      purchasePrice: buyValue,
      packSize: packValue,
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="buy">Harga beli (per kemasan)</Label>
                <Input
                  id="buy"
                  inputMode="decimal"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  placeholder="140000"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pack">Jumlah / isi ({unit})</Label>
                <Input
                  id="pack"
                  inputMode="decimal"
                  value={packSize}
                  onChange={(e) => setPackSize(e.target.value)}
                  placeholder="1000"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Harga per satuan: <span className="font-medium">{formatRpPrecise(costValue)}</span> / {unit} — dihitung
              otomatis dari harga beli ÷ jumlah isi, dipakai untuk HPP & profit tiap menu.
            </p>

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
