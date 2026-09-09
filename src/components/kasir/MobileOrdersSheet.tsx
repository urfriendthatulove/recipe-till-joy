import { Clock3, CreditCard, Phone, RefreshCw, Table2, Truck } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatNumber, formatRp, formatTanggalJam } from "@/lib/format";
import {
  getMobileFulfilmentModeLabel,
  getMobileOrderStatusClassName,
  getMobileOrderStatusLabel,
  isMobileOrderActive,
  type MobileOrder,
  type MobileOrderStatus,
} from "@/lib/mobileOrdersClient";

type MobileOrdersSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: MobileOrder[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  onUpdateStatus: (orderId: string, status: MobileOrderStatus) => Promise<void>;
  busyOrderId?: string | null;
};

const STATUS_FLOW: Record<MobileOrderStatus, { label: string; next: MobileOrderStatus }[]> = {
  new: [
    { label: "Terima", next: "accepted" },
    { label: "Tolak", next: "cancelled" },
  ],
  accepted: [
    { label: "Siapkan", next: "preparing" },
    { label: "Batal", next: "cancelled" },
  ],
  preparing: [
    { label: "Siap", next: "ready" },
    { label: "Batal", next: "cancelled" },
  ],
  ready: [{ label: "Selesai", next: "completed" }],
  completed: [],
  cancelled: [],
};

export function MobileOrdersSheet({
  open,
  onOpenChange,
  orders,
  loading,
  error,
  onRefresh,
  onUpdateStatus,
  busyOrderId,
}: MobileOrdersSheetProps) {
  const activeOrders = useMemo(
    () => orders.filter((order) => isMobileOrderActive(order.status)),
    [orders],
  );
  const newOrders = useMemo(() => orders.filter((order) => order.status === "new"), [orders]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            Pesanan Mobile
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              {activeOrders.length} aktif
            </Badge>
          </SheetTitle>
          <SheetDescription>
            Order dari aplikasi mobile yang masuk ke POS. Ubah status langsung dari sini.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Baru" value={newOrders.length} tone="warn" />
            <SummaryCard label="Aktif" value={activeOrders.length} tone="info" />
            <SummaryCard label="Semua" value={orders.length} tone="neutral" />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/35 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Sinkron otomatis setiap beberapa detik untuk menangkap order baru.
            </p>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
              Refresh
            </Button>
          </div>

          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {loading && orders.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Memuat pesanan mobile...
            </div>
          ) : null}

          {!loading && orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Belum ada pesanan dari mobile app.
            </div>
          ) : null}

          <div className="space-y-3">
            {orders.map((order) => (
              <article key={order.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">{order.orderNumber}</h3>
                      <Badge className={getMobileOrderStatusClassName(order.status)}>
                        {getMobileOrderStatusLabel(order.status)}
                      </Badge>
                      {order.externalOrderId ? (
                        <Badge variant="outline">{order.externalOrderId}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Masuk {formatTanggalJam(order.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{formatRp(order.total)}</p>
                    {order.discount > 0 ? (
                      <p className="text-xs text-muted-foreground">Diskon {formatRp(order.discount)}</p>
                    ) : null}
                    {order.deliveryFee > 0 ? (
                      <p className="text-xs text-muted-foreground">Ongkir {formatRp(order.deliveryFee)}</p>
                    ) : null}
                    {order.voucherCode ? (
                      <p className="text-xs text-muted-foreground">Voucher {order.voucherCode}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                  <InfoLine icon={<Phone className="size-3.5" />} text={order.customerPhone ?? "-"} />
                  <InfoLine icon={<Table2 className="size-3.5" />} text={order.tableName ?? "Dine-in/Takeaway"} />
                  <InfoLine icon={<Clock3 className="size-3.5" />} text={order.customerName ?? "Tanpa nama"} />
                  <InfoLine
                    icon={<Truck className="size-3.5" />}
                    text={getMobileFulfilmentModeLabel(order.fulfilmentMode) ?? "-"}
                  />
                  <InfoLine icon={<CreditCard className="size-3.5" />} text={order.paymentMethod ?? "-"} />
                </div>

                {order.note ? (
                  <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-900">
                    {order.note}
                  </div>
                ) : null}

                <Separator className="my-4" />

                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl bg-secondary/30 px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{item.qty}x {item.menuName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.modifiers.length > 0 ? `Modifier: ${item.modifiers.join(", ")}` : "Tanpa modifier"}
                          {item.note ? ` • ${item.note}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-foreground">{formatRp(item.lineTotal)}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {STATUS_FLOW[order.status].map((action) => (
                    <Button
                      key={action.next}
                      size="sm"
                      variant={action.next === "cancelled" ? "destructive" : action.next === "completed" ? "default" : "outline"}
                      onClick={() => void onUpdateStatus(order.id, action.next)}
                      disabled={busyOrderId === order.id}
                    >
                      {busyOrderId === order.id ? "Memproses..." : action.label}
                    </Button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <SheetFooter className="mt-6 gap-2 sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {orders.length > 0 ? `${orders.length} order tersinkron.` : "Belum ada order."}
          </div>
          <Button onClick={() => onOpenChange(false)}>Tutup</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "warn" | "info" | "neutral" }) {
  const toneClassName =
    tone === "warn"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-900"
      : tone === "info"
        ? "border-sky-500/20 bg-sky-500/10 text-sky-900"
        : "border-border bg-secondary/40 text-foreground";

  return (
    <div className={`rounded-2xl border p-3 ${toneClassName}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

function InfoLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate text-xs">{text}</span>
    </div>
  );
}