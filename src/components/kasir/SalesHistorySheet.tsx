import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { db } from "@/lib/db";
import { formatRp, formatTanggalJam } from "@/lib/format";
import { PAYMENT_LABEL, voidSale } from "@/lib/sales";

export function SalesHistorySheet({
  open,
  onOpenChange,
  canVoid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canVoid: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const sales = useLiveQuery(
    async () => (await db.sales.orderBy("createdAt").reverse().limit(50).toArray()) ?? [],
    [],
    [],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Riwayat transaksi</SheetTitle>
          <SheetDescription>
            50 nota terakhir. Membatalkan nota akan mengembalikan stok bahan.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-6">
          {sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada transaksi.</p>
          ) : (
            sales.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {s.saleNumber}{" "}
                      {s.voided ? (
                        <Badge variant="outline" className="border-destructive/50 text-destructive">
                          batal
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTanggalJam(s.createdAt)} • {PAYMENT_LABEL[s.paymentMethod]}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums">{formatRp(s.netSales)}</p>
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {s.items.map((i) => (
                    <li key={i.id}>
                      {i.qty}× {i.nameSnapshot}
                    </li>
                  ))}
                </ul>
                {!s.voided && canVoid ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    disabled={busy === s.id}
                    onClick={async () => {
                      setBusy(s.id);
                      try {
                        await voidSale(s.id);
                        toast.success(`${s.saleNumber} dibatalkan, stok dikembalikan`);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Gagal membatalkan");
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Batalkan nota
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
