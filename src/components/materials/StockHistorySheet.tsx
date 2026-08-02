import { useLiveQuery } from "dexie-react-hooks";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { db, type RawMaterial } from "@/lib/db";
import { formatNumber, formatTanggalJam } from "@/lib/format";
import { MOVEMENT_LABEL } from "@/lib/materials";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  material: RawMaterial | null;
}

const TONE: Record<string, string> = {
  in: "bg-success/12 text-success border-success/30",
  out: "bg-primary/10 text-primary border-primary/25",
  waste: "bg-destructive/10 text-destructive border-destructive/25",
  adjustment: "bg-warning/15 text-warning-foreground border-warning/35",
};

export function StockHistorySheet({ open, onOpenChange, material }: Props) {
  const movements = useLiveQuery(
    async () => {
      if (!material) return [];
      const rows = await db.movements.where("materialId").equals(material.id).toArray();
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    [material?.id, open],
    [],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Kartu stok — {material?.name}</SheetTitle>
          <SheetDescription>
            Semua pergerakan stok, termasuk pemakaian otomatis dari transaksi penjualan.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-6">
          {movements.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada pergerakan.</p>
          ) : (
            movements.map((m) => {
              const sign = m.type === "in" ? "+" : m.type === "adjustment" ? "±" : "−";
              return (
                <div key={m.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className={TONE[m.type]}>
                      {MOVEMENT_LABEL[m.type]}
                    </Badge>
                    <span className="font-mono text-sm font-semibold">
                      {sign}
                      {formatNumber(m.qty)} {material?.unit}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatTanggalJam(m.createdAt)}</span>
                    <span>
                      sisa {formatNumber(m.balanceAfter)} {material?.unit}
                    </span>
                  </div>
                  {m.note ? <p className="mt-1 text-xs text-muted-foreground">{m.note}</p> : null}
                  {m.refId ? (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      ref: {m.refType}/{m.refId.slice(0, 8)}
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
