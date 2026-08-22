import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
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
import { db, uid, BASE_UNIT_LABEL, type BaseUnit, type MaterialType, type RawMaterial } from "@/lib/db";
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
  const [supplier, setSupplier] = useState("");
  const [unit, setUnit] = useState<BaseUnit>("ml");
  const [materialType, setMaterialType] = useState<MaterialType>("single");
  const [mixComponents, setMixComponents] = useState<{ id: string; materialId: string; qty: string }[]>([]);
  const [minStock, setMinStock] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [packSize, setPackSize] = useState("");
  const [opening, setOpening] = useState("");
  const [saving, setSaving] = useState(false);

  const allMaterials = useLiveQuery(async () => db.materials.toArray(), [], [] as RawMaterial[]);

  useEffect(() => {
    if (!open) return;
    setName(material?.name ?? "");
    setSupplier(material?.supplier ?? "");
    setUnit(material?.unit ?? "ml");
    setMaterialType(material?.materialType ?? "single");
    setMixComponents(
      (material?.mixComponents ?? []).map((item) => ({
        id: item.id,
        materialId: item.materialId,
        qty: String(item.qty),
      })),
    );
    setMinStock(material ? String(material.minStock) : "");
    setBuyPrice(material?.purchasePrice ? String(material.purchasePrice) : "");
    setPackSize(material?.packSize ? String(material.packSize) : "");
    setOpening("");
  }, [open, material]);

  const mixRows = useMemo(() => {
    if (materialType !== "mix") return [];
    return mixComponents.length
      ? mixComponents
      : [{ id: uid(), materialId: "", qty: "" }];
  }, [materialType, mixComponents]);

  const buyValue = parseLocaleNumber(buyPrice);
  const packValue = parseLocaleNumber(packSize);
  const baseCostValue = packValue > 0 ? buyValue / packValue : (material?.costPerUnit ?? 0);
  const mixCostValue = useMemo(() => {
    if (materialType !== "mix") return baseCostValue;
    const valid = mixComponents.filter((row) => row.materialId && Number(row.qty) > 0);
    if (!valid.length) return 0;

    const totalQty = valid.reduce((sum, row) => sum + Number(row.qty), 0);
    const totalCost = valid.reduce((sum, row) => {
      const target = allMaterials.find((m) => m.id === row.materialId);
      return sum + (target ? (target.costPerUnit * Number(row.qty)) : 0);
    }, 0);

    return totalQty > 0 ? totalCost / totalQty : 0;
  }, [materialType, mixComponents, allMaterials, baseCostValue]);

  const costValue = materialType === "mix" ? mixCostValue : baseCostValue;

  function addMixComponent() {
    setMixComponents((prev) => [...prev, { id: uid(), materialId: "", qty: "" }]);
  }

  function updateMixComponent(id: string, patch: Partial<{ materialId: string; qty: string }>) {
    setMixComponents((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removeMixComponent(id: string) {
    setMixComponents((prev) => prev.filter((row) => row.id !== id));
  }

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


    if (materialType === "mix") {
      const validMix = mixComponents.filter((row) => row.materialId && Number(row.qty) > 0);
      if (validMix.length === 0) {
        toast.error("Pilih setidaknya satu komponen bahan campuran");
        return;
      }
    }

    const payload: MaterialInput = {
      name,
      supplier: supplier.trim(),
      unit,
      materialType,
      mixComponents: mixComponents
        .filter((row) => row.materialId && Number(row.qty) > 0)
        .map((row) => ({ materialId: row.materialId, qty: Number(row.qty) })),
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

            <div className="grid gap-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="PT. Maju Jaya"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Jenis bahan</Label>
                <Select value={materialType} onValueChange={(v) => setMaterialType(v as MaterialType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="mix">Mix</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
            </div>

            {materialType === "mix" ? (
              <div className="grid gap-3 rounded-md border border-dashed border-border p-3">
                <div className="flex items-center justify-between">
                  <Label>Komposisi bahan campuran</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addMixComponent}>
                    Tambah komponen
                  </Button>
                </div>

                {mixRows.map((row, index) => (
                  <div key={row.id} className="grid gap-2 sm:grid-cols-[1.5fr_0.8fr_auto]">
                    <Select
                      value={row.materialId}
                      onValueChange={(value) => updateMixComponent(row.id, { materialId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Komponen ${index + 1}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {allMaterials
                          .filter((item) => item.id !== material?.id)
                          .map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>

                    <Input
                      inputMode="decimal"
                      value={row.qty}
                      onChange={(e) => updateMixComponent(row.id, { qty: e.target.value })}
                      placeholder="Qty"
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMixComponent(row.id)}
                      disabled={mixRows.length === 1}
                      aria-label="Hapus komponen"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
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
              {materialType === "mix"
                ? " otomatis dari komposisi bahan campuran"
                : " otomatis dari harga beli ÷ jumlah isi"}
              , dipakai untuk HPP & profit tiap menu.
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
