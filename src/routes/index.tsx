import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, ArrowDownUp, History, Pencil, Plus, Search, Undo2, Archive } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { MaterialFormDialog } from "@/components/materials/MaterialFormDialog";
import { StockHistorySheet } from "@/components/materials/StockHistorySheet";
import { StockMovementDialog } from "@/components/materials/StockMovementDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  const [ready, setReady] = useState(false);

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
  const [formOpen, setFormOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selected, setSelected] = useState<RawMaterial | null>(null);

  const materials = useLiveQuery(
    async () => (await db.materials.toArray()).sort((a, b) => a.name.localeCompare(b.name, "id")),
    [],
    [] as RawMaterial[],
  );

  const visible = materials.filter(
    (m) =>
      (showArchived ? m.isActive === 0 : m.isActive === 1) &&
      m.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const active = materials.filter((m) => m.isActive === 1);
  const low = active.filter((m) => m.currentStock <= m.minStock);
  const inventoryValue = active.reduce((s, m) => s + m.currentStock * m.costPerUnit, 0);

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
      title="Bahan Baku"
      description="Master bahan, stok masuk, dan kartu stok yang bisa ditelusuri."
      actions={
        <Button onClick={() => openForm(null)}>
          <Plus className="size-4" /> Tambah Bahan
        </Button>
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Bahan aktif" value={`${active.length} item`} />
        <Stat
          label="Nilai stok"
          value={formatRp(inventoryValue)}
          hint="stok × harga pokok"
        />
        <Stat
          label="Stok menipis"
          value={`${low.length} item`}
          tone={low.length > 0 ? "warn" : "ok"}
        />
      </div>

      {low.length > 0 && !showArchived ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-warning" />
          <span className="font-medium">Perlu restock:</span>
          {low.map((m) => (
            <button
              key={m.id}
              onClick={() => openMove(m)}
              className="rounded-md bg-card px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline"
            >
              {m.name} ({formatNumber(m.currentStock)} {m.unit})
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari bahan…"
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          Tampilkan arsip
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/60">
              <TableHead>Bahan</TableHead>
              <TableHead className="text-right">Stok</TableHead>
              <TableHead className="text-right">Min.</TableHead>
              <TableHead className="text-right">Harga pokok</TableHead>
              <TableHead className="text-right">Nilai</TableHead>
              <TableHead className="w-40 text-right">Aksi</TableHead>
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
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">satuan {m.unit}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={isLow ? "font-semibold text-destructive" : ""}>
                        {formatNumber(m.currentStock)}
                      </span>
                      {isLow ? (
                        <Badge variant="outline" className="ml-2 border-destructive/30 bg-destructive/10 text-destructive">
                          menipis
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatNumber(m.minStock)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatRpPrecise(m.costPerUnit)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatRp(m.currentStock * m.costPerUnit)}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.isActive === 1 ? (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" title="Catat stok" onClick={() => openMove(m)}>
                            <ArrowDownUp className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Kartu stok" onClick={() => openHistory(m)}>
                            <History className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => openForm(m)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Arsipkan"
                            onClick={async () => {
                              await archiveMaterial(m.id);
                              toast.success(`${m.name} diarsipkan`);
                            }}
                          >
                            <Archive className="size-4" />
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
