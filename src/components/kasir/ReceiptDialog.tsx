import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Sale } from "@/lib/db";
import { formatRp, formatTanggalJam } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/sales";

export function ReceiptDialog({
  sale,
  onOpenChange,
}: {
  sale: Sale | null;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={!!sale} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" /> Transaksi tersimpan
          </DialogTitle>
          <DialogDescription>
            {sale ? `${sale.saleNumber} • ${formatTanggalJam(sale.createdAt)}` : null}
          </DialogDescription>
        </DialogHeader>

        {sale ? (
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              {sale.items.map((i) => (
                <div key={i.id} className="flex justify-between gap-3">
                  <span className="truncate">
                    {i.qty}× {i.nameSnapshot}
                  </span>
                  <span className="tabular-nums">{formatRp(i.lineNet)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 border-t border-border pt-3">
              <Row label="Subtotal" value={formatRp(sale.subtotal)} />
              {sale.discount > 0 ? (
                <Row label="Diskon" value={`− ${formatRp(sale.discount)}`} />
              ) : null}
              <Row label="Total" value={formatRp(sale.netSales)} strong />
              <Row label="Pembayaran" value={PAYMENT_LABEL[sale.paymentMethod]} />
              <Row label="Laba kotor" value={formatRp(sale.profit)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Stok bahan sudah otomatis berkurang sesuai resep.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Transaksi baru</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
