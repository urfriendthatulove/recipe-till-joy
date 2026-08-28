import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Archive,
  PackagePlus,
  PencilLine,
  Plus,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { useAuth } from "@/components/auth/AuthProvider";
import { MaterialFormDialog } from "@/components/materials/MaterialFormDialog";
import { StockHistorySheet } from "@/components/materials/StockHistorySheet";
import { StockMovementDialog } from "@/components/materials/StockMovementDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db, type RawMaterial } from "@/lib/db";
import { formatNumber, formatRp, formatRpPrecise } from "@/lib/format";
import { archiveMaterial, restoreMaterial } from "@/lib/materials";
import { seedIfEmpty } from "@/lib/seed";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bahan Baku — Quinos POS Coffee Shop" },
      {
        name: "description",
        content:
          "Kelola stok bahan baku coffee shop: restock, stok minimum, harga pokok, dan kartu stok yang bisa ditelusuri.",
      },
      { property: "og:title", content: "Bahan Baku — Quinos POS Coffee Shop" },
      {
        property: "og:description",
        content: "Catat stok bahan baku dan pemakaiannya secara otomatis dari resep menu.",
      },
    ],
  }),
  component: BahanBakuPage,
});

function BahanBakuPage() {
  const { role } = useAuth();
  const [ready, setReady] = useState(false);

  if (role !== "admin") {
    return <AccessDenied message="Role barista hanya bisa menginput transaksi di modul Kasir." />;
  }

  // Dexie hanya tersedia di browser; seed dijalankan sekali saat DB kosong.
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
      <AppShell title="Bahan Baku">
        <p className="text-sm text-muted-foreground">Memuat data lokal…</p>
      </AppShell>
    );
  }
  return <MaterialsView />;
}


function MaterialsView() {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [activeTab, setActiveTab] = useState<"stock" | "history">("stock");
  const [formOpen, setFormOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selected, setSelected] = useState<RawMaterial | null>(null);

  const materials = useLiveQuery(
    async () => (await db.materials.toArray()).sort((a, b) => a.name.localeCompare(b.name, "id")),
    [],
    [] as RawMaterial[],
  );

  const movements = useLiveQuery(async () => db.movements.orderBy("createdAt").reverse().toArray(), [], []);

  const visible = materials.filter(
    (m) =>
      (showArchived ? m.isActive === 0 : m.isActive === 1) &&
      m.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const latestByMaterial = useMemo(() => {
    const map = new Map<string, (typeof movements)[number]>();
    for (const mv of movements) {
      const current = map.get(mv.materialId);
      if (!current || (mv.createdAt ?? "") > (current.createdAt ?? "")) {
        map.set(mv.materialId, mv);
      }
    }
    return map;
  }, [movements]);

  const active = materials.filter((m) => m.isActive === 1);
  const low = active.filter((m) => m.currentStock <= m.minStock);
  const inventoryValue = active.reduce((s, m) => s + m.currentStock * m.costPerUnit, 0);
  const zeroStockCount = low.filter((m) => m.currentStock <= 0).length;

  // selalu pakai versi terbaru dari DB agar angka stok di dialog tidak basi
  const selectedLive = selected ? (materials.find((m) => m.id === selected.id) ?? selected) : null;

  const openForm = (m: RawMaterial | null) => {

    setSelected(m);
    setFormOpen(true);
  };
  const openMove = (m: RawMaterial) => {
    setSelected(m);
    setMoveOpen(true);
  };
  const openHistory = (m: RawMaterial) => {
    setSelected(m);
    setHistoryOpen(true);
  };

  return (
    <AppShell
      title="Master Bahan Baku"
      description="Modul A — stok, supplier, restock & kartu stok"
      notificationCount={low.length}
      notificationContent={
        low.length > 0 ? (
          <div>
            <div className="px-3 py-2">
              <p className="text-sm font-semibold text-foreground">Jumlah bahan menipis: {low.length}</p>
              <p className="text-xs text-muted-foreground">
                {zeroStockCount > 0
                  ? `${zeroStockCount} bahan sudah habis dan perlu diprioritaskan.`
                  : "Semua bahan ini sudah menyentuh atau di bawah batas minimum."}
              </p>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto px-1 py-1">
              {low.map((m) => {
                const isEmpty = m.currentStock <= 0;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => openMove(m)}
                    className={
                      "flex w-full items-start justify-between rounded-xl border px-3 py-2 text-left transition-colors hover:bg-secondary " +
                      (isEmpty
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-border bg-background")
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
                        (isEmpty
                          ? "bg-destructive/12 text-destructive"
                          : "bg-primary/10 text-primary")
                      }
                    >
                      {isEmpty ? "Stok 0" : "Restock"}
                    </span>
                  </button>
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
      notificationFooter={
        low.length > 0 ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Klik item untuk langsung restock.</span>
            <Button
              size="sm"
              onClick={() => {
                if (low[0]) openMove(low[0]);
              }}
              className="h-8 rounded-lg bg-primary px-3 text-primary-foreground hover:bg-primary/90"
            >
              Restock pertama
            </Button>
          </div>
        ) : null
      }
    >
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <Stat label="Jenis bahan" value={`${active.length}`} />
        <Stat label="Nilai stok (HPP)" value={formatRp(inventoryValue)} />
        <Stat label="Bahan menipis" value={`${low.length}`} tone={low.length > 0 ? "warn" : "ok"} />
      </div>

      <div className="mb-4 flex w-full items-center gap-2 overflow-hidden rounded-lg border border-border bg-[#f2efe9] p-1 shadow-sm">
        {[
          { label: "Stok Bahan", value: "stock" },
          { label: "Kartu Stok", value: "history" },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value as "stock" | "history")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? "bg-white text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "stock" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full lg:w-1/2">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari bahan atau supplier..."
                className="h-12 rounded-xl border-border bg-card pl-9 text-base shadow-sm"
              />
            </div>
            <Button
              onClick={() => openForm(null)}
              className="h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" />
              Bahan baru
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#f3efe9] hover:bg-[#f3efe9]">
                  <TableHead className="py-4 text-base font-medium text-foreground">Bahan</TableHead>
                  <TableHead className="py-4 text-base font-medium text-foreground">Supplier</TableHead>
                  <TableHead className="py-4 text-base font-medium text-foreground">Stok</TableHead>
                  <TableHead className="py-4 text-base font-medium text-foreground">Min.</TableHead>
                  <TableHead className="py-4 text-base font-medium text-foreground">HPP / satuan</TableHead>
                  <TableHead className="py-4 text-right text-base font-medium text-foreground">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      {showArchived ? "Tidak ada bahan yang diarsipkan." : "Belum ada bahan cocok."}
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((m) => {
                    const isLow = m.currentStock <= m.minStock;
                    return (
                      <TableRow key={m.id} className="border-b border-border/80 hover:bg-[#faf7f3]">
                        <TableCell className="py-4">
                          <div className="font-medium text-[15px] text-foreground">{m.name}</div>
                        </TableCell>
                        <TableCell className="py-4 text-[15px] text-muted-foreground">
                          {m.supplier || "-"}
                        </TableCell>
                        <TableCell className="py-4 text-[15px] font-medium text-foreground">
                          {isLow ? (
                            <span className="text-[#8c3d2b]">{formatNumber(m.currentStock)} {m.unit}</span>
                          ) : (
                            <span>{formatNumber(m.currentStock)} {m.unit}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4 text-[15px] text-muted-foreground">
                          {formatNumber(m.minStock)} {m.unit}
                        </TableCell>
                        <TableCell className="py-4 text-[15px] font-medium text-foreground">
                          {formatRpPrecise(m.costPerUnit)}
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          {m.isActive === 1 ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-9 rounded-lg border border-border bg-[#f3eee9] text-foreground hover:bg-[#eae3dc]"
                                onClick={() => openMove(m)}
                              >
                                <PackagePlus className="size-4" />
                                Restock
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-9 w-9 rounded-lg border border-border bg-card text-foreground hover:bg-secondary"
                                onClick={() => openForm(m)}
                              >
                                <PencilLine className="size-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-9 w-9 rounded-lg border border-border bg-card text-destructive hover:bg-red-50"
                                onClick={async () => {
                                  await archiveMaterial(m.id);
                                  toast.success(`${m.name} diarsipkan`);
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                await restoreMaterial(m.id);
                                toast.success(`${m.name} diaktifkan lagi`);
                              }}
                            >
                              <Undo2 className="size-4" /> Aktifkan
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#f3efe9] hover:bg-[#f3efe9]">
                <TableHead className="py-4 text-base font-medium text-foreground">Bahan</TableHead>
                <TableHead className="py-4 text-base font-medium text-foreground">Supplier</TableHead>
                <TableHead className="py-4 text-base font-medium text-foreground">Saldo</TableHead>
                <TableHead className="py-4 text-base font-medium text-foreground">Terakhir</TableHead>
                <TableHead className="py-4 text-base font-medium text-foreground">Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    Belum ada kartu stok.
                  </TableCell>
                </TableRow>
              ) : (
                materials
                  .filter((m) => m.isActive === 1)
                  .map((m) => {
                    const latest = latestByMaterial.get(m.id);
                    return (
                      <TableRow key={m.id} className="border-b border-border/80 hover:bg-[#faf7f3]">
                        <TableCell className="py-4 font-medium text-[15px] text-foreground">{m.name}</TableCell>
                        <TableCell className="py-4 text-[15px] text-muted-foreground">{m.supplier || "-"}</TableCell>
                        <TableCell className="py-4 text-[15px] font-medium text-foreground">
                          {formatNumber(m.currentStock)} {m.unit}
                        </TableCell>
                        <TableCell className="py-4 text-[15px] text-muted-foreground">
                          {latest ? new Date(latest.createdAt).toLocaleString("id-ID", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }) : "-"}
                        </TableCell>
                        <TableCell className="py-4 text-[15px] text-muted-foreground">
                          {latest ? `${latest.type.toUpperCase()} • ${latest.note ?? "-"}` : "Belum ada pergerakan"}
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <MaterialFormDialog open={formOpen} onOpenChange={setFormOpen} material={selectedLive} />
      <StockMovementDialog open={moveOpen} onOpenChange={setMoveOpen} material={selectedLive} />
      <StockHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} material={selectedLive} />
    </AppShell>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="stat-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-semibold ${
          tone === "warn" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
