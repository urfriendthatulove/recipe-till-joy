import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Download, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/AppShell";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import { formatNumber, formatRp } from "@/lib/format";
import {
  dailySeries,
  downloadCSV,
  inRange,
  inventoryValue,
  materialUsageReport,
  menuRanking,
  paymentBreakdown,
  rangeBounds,
  RANGE_LABEL,
  summarize,
  type RangeKey,
} from "@/lib/reports";
import { PAYMENT_LABEL } from "@/lib/sales";
import { seedIfEmpty } from "@/lib/seed";

export const Route = createFileRoute("/laporan")({
  head: () => ({
    meta: [
      { title: "Laporan & Dashboard — Quinos POS Coffee Shop" },
      {
        name: "description",
        content:
          "Ringkasan omzet, HPP, laba, menu terlaris, pemakaian bahan baku, dan nilai persediaan coffee shop.",
      },
      { property: "og:title", content: "Laporan & Dashboard — Quinos POS Coffee Shop" },
      {
        property: "og:description",
        content: "Pantau omzet, laba, menu terlaris, dan pemakaian bahan baku dalam satu halaman.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LaporanPage,
});

function LaporanPage() {
  const { role } = useAuth();
  const [ready, setReady] = useState(false);

  if (role !== "admin") {
    return <AccessDenied message="Role barista tidak memiliki akses ke dashboard laporan." />;
  }

  useEffect(() => {
    seedIfEmpty()
      .then(() => setReady(true))
      .catch((e) => {
        console.error(e);
        toast.error("Gagal membuka database lokal");
      });
  }, []);

  if (!ready) {
    return (
      <AppShell title="Laporan" description="Menyiapkan data…">
        <p className="text-sm text-muted-foreground">Memuat…</p>
      </AppShell>
    );
  }
  return <LaporanContent />;
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
  className,
  style,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "warning";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Card className={`rounded-2xl border-border/90 shadow-sm ${className ?? ""}`} style={style}>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p
          className={
            "mt-2 font-display text-xl font-semibold sm:text-2xl " +
            (tone === "positive"
              ? "text-primary"
              : tone === "warning"
                ? "text-destructive"
                : "text-foreground")
          }
        >
          {value}
        </p>
        {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function LaporanContent() {
  const [range, setRange] = useState<RangeKey>("7d");

  const sales = useLiveQuery(() => db.sales.toArray(), [], []);
  const materials = useLiveQuery(() => db.materials.toArray(), [], []);
  const movements = useLiveQuery(() => db.movements.toArray(), [], []);

  const { start, end } = useMemo(() => rangeBounds(range), [range]);

  const salesInRange = useMemo(
    () => sales.filter((s) => inRange(s.createdAt, start, end)),
    [sales, start, end],
  );
  const movementsInRange = useMemo(
    () => movements.filter((m) => inRange(m.createdAt, start, end)),
    [movements, start, end],
  );

  const sum = useMemo(() => summarize(salesInRange), [salesInRange]);
  const series = useMemo(
    () => dailySeries(salesInRange, range === "all" ? (salesInRange[0] ? new Date(salesInRange.reduce((a, s) => (s.createdAt < a ? s.createdAt : a), salesInRange[0].createdAt)) : start) : start, end),
    [salesInRange, start, end, range],
  );
  const ranking = useMemo(() => menuRanking(salesInRange), [salesInRange]);
  const payments = useMemo(() => paymentBreakdown(salesInRange), [salesInRange]);
  const usage = useMemo(
    () => materialUsageReport(movementsInRange, materials),
    [movementsInRange, materials],
  );

  const voidedCount = salesInRange.filter((s) => s.voided).length;
  const lowStock = materials.filter((m) => m.isActive && m.currentStock <= m.minStock);
  const stockValue = inventoryValue(materials);

  const exportPenjualan = () => {
    downloadCSV(`laporan-penjualan-${range}.csv`, [
      ["Tanggal", "No. Nota", "Metode", "Subtotal", "Diskon", "Omzet", "HPP", "Laba", "Status"],
      ...salesInRange.map((s) => [
        new Date(s.createdAt).toLocaleString("id-ID"),
        s.saleNumber,
        PAYMENT_LABEL[s.paymentMethod],
        s.subtotal,
        s.discount,
        s.netSales,
        s.totalCost,
        s.netSales - s.totalCost,
        s.voided ? "Batal" : "Sah",
      ]),
    ]);
  };

  const exportMenu = () => {
    downloadCSV(`laporan-menu-${range}.csv`, [
      ["Menu", "Qty", "Omzet", "HPP", "Laba", "Margin %"],
      ...ranking.map((r) => [
        r.name,
        r.qty,
        r.omzet,
        r.hpp,
        r.laba,
        r.omzet > 0 ? ((r.laba / r.omzet) * 100).toFixed(1) : "0",
      ]),
    ]);
  };

  return (
    <AppShell
      title="Dashboard & Laporan"
      description={`Ringkasan performa penjualan — ${RANGE_LABEL[range]}`}
      notificationCount={lowStock.length}
      notificationContent={
        lowStock.length > 0 ? (
          <div>
            <div className="px-3 py-2">
              <p className="text-sm font-semibold text-foreground">Bahan perlu restock: {lowStock.length}</p>
              <p className="text-xs text-muted-foreground">
                Prioritaskan bahan dengan stok paling kritis agar operasional tidak terganggu.
              </p>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto px-1 py-1">
              {lowStock.map((m) => {
                const isEmpty = m.currentStock <= 0;
                return (
                  <div
                    key={m.id}
                    className={
                      "flex items-start justify-between rounded-xl border px-3 py-2 " +
                      (isEmpty ? "border-destructive/30 bg-destructive/5" : "border-border bg-background")
                    }
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{m.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Sisa {formatNumber(m.currentStock)} {m.unit} • Min {formatNumber(m.minStock)} {m.unit}
                      </p>
                    </div>
                    <span
                      className={
                        "rounded-full px-2 py-1 text-[11px] font-semibold " +
                        (isEmpty ? "bg-destructive/12 text-destructive" : "bg-primary/10 text-primary")
                      }
                    >
                      {isEmpty ? "Stok 0" : "Menipis"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            Semua bahan masih di atas batas minimum.
          </div>
        )
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportPenjualan}>
            <Download className="mr-2 size-4" /> Ekspor nota
          </Button>
          <Button variant="outline" size="sm" onClick={exportMenu}>
            <Download className="mr-2 size-4" /> Ekspor menu
          </Button>
        </div>
      }
    >
      <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)} className="mb-5 stagger-item" style={{ "--item-index": 0 } as CSSProperties}>
        <TabsList className="flex-wrap rounded-xl border border-border bg-background p-1">
          {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
            <TabsTrigger key={k} value={k} className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              {RANGE_LABEL[k]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="stagger-fade grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Omzet bersih"
          value={formatRp(sum.omzet)}
          hint={`${sum.nota} nota • ${formatNumber(sum.itemTerjual)} item`}
          className="stagger-item"
          style={{ "--item-index": 1 } as CSSProperties}
        />
        <Kpi
          label="HPP bahan"
          value={formatRp(sum.hpp)}
          hint={`Diskon ${formatRp(sum.diskon)}`}
          className="stagger-item"
          style={{ "--item-index": 2 } as CSSProperties}
        />
        <Kpi
          label="Laba kotor"
          value={formatRp(sum.laba)}
          hint={`Margin ${sum.margin.toFixed(1)}%`}
          tone="positive"
          className="stagger-item"
          style={{ "--item-index": 3 } as CSSProperties}
        />
        <Kpi
          label="Rata-rata / nota"
          value={formatRp(sum.avgNota)}
          hint={voidedCount ? `${voidedCount} nota dibatalkan` : "Tidak ada nota batal"}
          className="stagger-item"
          style={{ "--item-index": 4 } as CSSProperties}
        />
      </div>

      <div className="stagger-fade mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="stagger-item rounded-2xl border-border/90 shadow-sm" style={{ "--item-index": 5 } as CSSProperties}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-primary" /> Omzet & laba harian
            </CardTitle>
            <span className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Live Overview
            </span>
          </CardHeader>
          <CardContent className="h-[290px]">
            {sum.nota === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Belum ada transaksi pada rentang ini.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
                  />
                  <Tooltip
                    formatter={(v: number, n) => [formatRp(v), n === "omzet" ? "Omzet" : "Laba"]}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="omzet"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="laba"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="stagger-item rounded-2xl border-border/90 shadow-sm" style={{ "--item-index": 6 } as CSSProperties}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Metode pembayaran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payments.size === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada data.</p>
            ) : (
              [...payments.entries()].map(([method, v]) => {
                const pct = sum.omzet > 0 ? (v.total / sum.omzet) * 100 : 0;
                return (
                  <div key={method}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{PAYMENT_LABEL[method]}</span>
                      <span className="text-muted-foreground">{formatRp(v.total)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {v.nota} nota • {pct.toFixed(0)}%
                    </p>
                  </div>
                );
              })
            )}
            <div className="border-t border-border pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Nilai persediaan sekarang
              </p>
              <p className="font-display text-lg font-semibold">{formatRp(stockValue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="stagger-fade mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="stagger-item rounded-2xl border-border/90 shadow-sm" style={{ "--item-index": 7 } as CSSProperties}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Menu terlaris</CardTitle>
          </CardHeader>
          <CardContent className="h-[290px]">
            {ranking.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Belum ada penjualan.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={ranking.slice(0, 7)}
                  layout="vertical"
                  margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatRp(v), "Omzet"]}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="omzet" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="stagger-item rounded-2xl border-border/90 shadow-sm" style={{ "--item-index": 8 } as CSSProperties}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pemakaian bahan baku</CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bahan</TableHead>
                  <TableHead className="text-right">Terpakai</TableHead>
                  <TableHead className="text-right">Rusak</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      Belum ada pemakaian pada rentang ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  usage.map((u) => (
                    <TableRow key={u.materialId}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-right">
                        {formatNumber(u.terpakai)} {u.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.waste ? `${formatNumber(u.waste)} ${u.unit}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">{formatRp(u.nilai)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="stagger-item mt-4 rounded-2xl border-border/90 shadow-sm" style={{ "--item-index": 9 } as CSSProperties}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Rincian menu</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Menu</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Omzet</TableHead>
                <TableHead className="text-right">HPP</TableHead>
                <TableHead className="text-right">Laba</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Belum ada penjualan pada rentang ini.
                  </TableCell>
                </TableRow>
              ) : (
                ranking.map((r) => {
                  const margin = r.omzet > 0 ? (r.laba / r.omzet) * 100 : 0;
                  const health = margin >= 55 ? "Sangat baik" : margin >= 35 ? "Stabil" : "Perlu evaluasi";
                  const initials = r.name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase() ?? "")
                    .join("");

                  return (
                  <TableRow key={r.menuItemId} className="border-b border-border/70 transition-colors hover:bg-secondary/70">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {initials || "MN"}
                        </span>
                        <div>
                          <p className="font-medium text-foreground">{r.name}</p>
                          <p className="text-xs text-muted-foreground">Performa {margin.toFixed(0)}% margin</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(r.qty)}</TableCell>
                    <TableCell className="text-right">{formatRp(r.omzet)}</TableCell>
                    <TableCell className="text-right">{formatRp(r.hpp)}</TableCell>
                    <TableCell className="text-right">{formatRp(r.laba)}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
                          (margin >= 55
                            ? "bg-primary text-primary-foreground"
                            : margin >= 35
                              ? "bg-secondary text-foreground"
                              : "bg-destructive/12 text-destructive")
                        }
                      >
                        {health}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
