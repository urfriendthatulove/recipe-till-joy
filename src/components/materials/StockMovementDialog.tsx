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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { INPUT_UNITS, type MovementType, type RawMaterial } from "@/lib/db";
import { formatNumber, formatRp, parseLocaleNumber } from "@/lib/format";
import { recordMovement } from "@/lib/materials";

type Mode = Extract<MovementType, "in" | "waste" | "adjustment">;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  material: RawMaterial | null;
}

export function StockMovementDialog({ open, onOpenChange, material }: Props) {
  const [mode, setMode] = useState<Mode>("in");
  const [qty, setQty] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const unitOptions = material ? INPUT_UNITS[material.unit] : [];
  const factor = unitOptions.find((u) => u.label === unitLabel)?.factor ?? 1;

  useEffect(() => {
    if (!open || !material) return;
    setMode("in");
    setQty("");
    setPrice("");
    setNote("");
    setUnitLabel(INPUT_UNITS[material.unit][0]!.label);
  }, [open, material]);

  if (!material) return null;

  const qtyBase = parseLocaleNumber(qty) * factor;
  const totalPrice = parseLocaleNumber(price);
  /** harga beli total ÷ jumlah satuan dasar = harga pokok baru per satuan */
  const newUnitCost = qtyBase > 0 && totalPrice > 0 ? totalPrice / qtyBase : 0;

  const preview =
    mode === "adjustment"
      ? qtyBase
      : mode === "in"
        ? material.currentStock + qtyBase
        : material.currentStock - qtyBase;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!material) return;
    if (qtyBase <= 0 && mode !== "adjustment") {
      toast.error("Jumlah harus lebih dari 0");
      return;
    }
    if (preview < 0) {
      toast.error(
        `Stok ${material.name} tidak cukup — tersisa ${formatNumber(material.currentStock)} ${material.unit}`,
      );
      return;
    }

    setSaving(true);
    try {
      await recordMovement({
        materialId: material.id,
        type: mode,
        qty: qtyBase,
        ...(mode === "in" && newUnitCost > 0 ? { unitCost: newUnitCost } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        refType: mode === "in" ? "purchase" : "manual",
      });
      toast.success(
        mode === "in"
          ? `Stok ${material.name} bertambah`
          : mode === "waste"
            ? `Pengurangan stok ${material.name} dicatat`
            : `Stok ${material.name} disesuaikan`,
      );
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
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{material.name}</DialogTitle>
            <DialogDescription>
              Stok saat ini {formatNumber(material.currentStock)} {material.unit}. Semua perubahan
              tercatat di kartu stok.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="in">Restock</TabsTrigger>
                <TabsTrigger value="waste">Rusak/Buang</TabsTrigger>
                <TabsTrigger value="adjustment">Opname</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid gap-2">
              <Label htmlFor="qty">
                {mode === "adjustment" ? "Hasil hitung fisik" : "Jumlah"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="qty"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
                {unitOptions.length > 1 ? (
                  <Select value={unitLabel} onValueChange={setUnitLabel}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((u) => (
                        <SelectItem key={u.label} value={u.label}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="flex w-32 items-center justify-center rounded-md border border-input text-sm text-muted-foreground">
                    {material.unit}
                  </span>
                )}
              </div>
            </div>

            {mode === "in" ? (
              <div className="grid gap-2">
                <Label htmlFor="price">Total harga beli (opsional)</Label>
                <Input
                  id="price"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="180000"
                />
                {newUnitCost > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Harga pokok diperbarui jadi {formatRp(newUnitCost * 1000) } per{" "}
                    {material.unit === "ml" ? "liter" : material.unit === "g" ? "kg" : "1000 pcs"}.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="note">Catatan</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={mode === "in" ? "Beli di Toko Sinar Jaya" : "Tumpah saat steaming"}
              />
            </div>

            <div className="rounded-lg bg-secondary px-3 py-2 text-sm">
              Stok setelah dicatat:{" "}
              <span className="font-semibold">
                {formatNumber(preview)} {material.unit}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Catat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
