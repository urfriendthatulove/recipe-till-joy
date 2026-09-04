import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
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
import type { MenuItem } from "@/lib/db";
import { formatRp } from "@/lib/format";
import { uid } from "@/lib/db";
import type { CartLine } from "@/lib/sales";

const TEMPERATURE_OPTIONS = [
  { label: "Ice", value: "ice" },
  { label: "Hot", value: "hot" },
] as const;

const SWEETNESS_OPTIONS = [
  { label: "Sugar", value: "sugar" },
  { label: "Less Sugar", value: "less-sugar" },
] as const;

const MODIFIER_OPTIONS = ["Extra Shot", "Oat Milk", "Less Ice", "Whipped Cream"] as const;

interface Props {
  open: boolean;
  menu: MenuItem | null;
  initialLine?: CartLine | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (line: CartLine) => void;
  onDelete?: (lineId: string) => void;
}

function titleizeModifier(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function MenuOrderDialog({
  open,
  menu,
  initialLine,
  onOpenChange,
  onConfirm,
  onDelete,
}: Props) {
  const [qty, setQty] = useState(1);
  const [qtyInput, setQtyInput] = useState("1");
  const [temperature, setTemperature] = useState<CartLine["temperature"]>("ice");
  const [sweetness, setSweetness] = useState<CartLine["sweetness"]>("sugar");
  const [modifiers, setModifiers] = useState<string[]>([]);

  const isEditMode = Boolean(initialLine);

  useEffect(() => {
    if (!open || !menu) return;
    if (initialLine) {
      setQty(Math.max(1, initialLine.qty));
      setQtyInput(String(Math.max(1, initialLine.qty)));
      setTemperature(initialLine.temperature);
      setSweetness(initialLine.sweetness);
      setModifiers(initialLine.modifiers);
      return;
    }

    setQty(1);
    setQtyInput("1");
    setTemperature("ice");
    setSweetness("sugar");
    setModifiers([]);
  }, [open, menu, initialLine]);

  const previewLabel = useMemo(() => {
    if (!menu) return "";
    const tags = [titleizeModifier(temperature), titleizeModifier(sweetness), ...modifiers];
    return `${menu.name} • ${tags.join(" • ")}`;
  }, [menu, temperature, sweetness, modifiers]);

  function toggleModifier(modifier: string) {
    setModifiers((prev) =>
      prev.includes(modifier) ? prev.filter((item) => item !== modifier) : [...prev, modifier],
    );
  }

  function onQtyInputChange(value: string) {
    setQtyInput(value);
    const parsed = Number(value.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    setQty(parsed);
  }

  if (!menu) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100vw-1rem,52rem)] max-w-none p-0 sm:rounded-2xl">
        <div className="flex max-h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden">
          <DialogHeader className="px-4 pt-5 sm:px-6">
            <DialogTitle className="font-display text-2xl">
              {isEditMode ? "Ubah Pesanan" : "Atur Pesanan"}
            </DialogTitle>
            <DialogDescription>
              Pilih jumlah, temperatur, tingkat gula, dan modifier sebelum masuk ke keranjang.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="space-y-4 sm:space-y-5">
              <div className="rounded-2xl border border-border bg-secondary/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold text-foreground">{menu.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatRp(menu.price)} per item
                    </p>
                  </div>
                  <Badge className="rounded-full px-3 py-1">Preview</Badge>
                </div>
                <p className="mt-3 break-words text-sm text-foreground">{previewLabel}</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-semibold text-foreground">Jumlah Menu yang dipesan</p>
                  <div className="inline-flex items-center rounded-xl border border-border bg-background p-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setQty((current) => {
                          const next = Math.max(1, current - 1);
                          setQtyInput(String(next));
                          return next;
                        });
                      }}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <Input
                      inputMode="numeric"
                      value={qtyInput}
                      onChange={(e) => onQtyInputChange(e.target.value)}
                      onBlur={() => {
                        if (!qtyInput || Number(qtyInput) <= 0) {
                          setQty(1);
                          setQtyInput("1");
                        }
                      }}
                      className="h-10 w-16 border-0 bg-transparent p-0 text-center text-lg font-semibold tabular-nums shadow-none focus-visible:ring-0"
                      aria-label="Jumlah pesanan"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setQty((current) => {
                          const next = current + 1;
                          setQtyInput(String(next));
                          return next;
                        });
                      }}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-semibold text-foreground">Total sementara</p>
                  <div className="rounded-2xl bg-secondary/60 px-4 py-3">
                    <p className="text-2xl font-display font-semibold text-foreground">
                      {formatRp(menu.price * qty)}
                    </p>
                    <p className="text-xs text-muted-foreground">Belum termasuk diskon nota.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">Pilihan suhu</p>
                <div className="flex flex-wrap gap-2">
                  {TEMPERATURE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={temperature === option.value ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => setTemperature(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">Pilihan gula</p>
                <div className="flex flex-wrap gap-2">
                  {SWEETNESS_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={sweetness === option.value ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => setSweetness(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">Modifier</p>
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    Button modifier
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {MODIFIER_OPTIONS.map((modifier) => (
                    <Button
                      key={modifier}
                      type="button"
                      variant={modifiers.includes(modifier) ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => toggleModifier(modifier)}
                    >
                      {modifier}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
            {isEditMode && initialLine && onDelete ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  onDelete(initialLine.id);
                  onOpenChange(false);
                }}
                className="w-full sm:mr-auto sm:w-auto"
              >
                Hapus pesanan
              </Button>
            ) : null}
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-[auto_auto]">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onConfirm({
                    id: initialLine?.id ?? uid(),
                    menuItemId: menu.id,
                    qty,
                    discount: 0,
                    temperature,
                    sweetness,
                    modifiers,
                    displayName: previewLabel,
                  });
                  onOpenChange(false);
                }}
                className="whitespace-nowrap"
              >
                {isEditMode ? "Simpan perubahan" : "Tambah ke keranjang"}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
