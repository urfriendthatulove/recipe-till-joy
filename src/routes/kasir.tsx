import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { History, Minus, Plus, Search, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { ReceiptDialog } from "@/components/kasir/ReceiptDialog";
import { SalesHistorySheet } from "@/components/kasir/SalesHistorySheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db, type Sale } from "@/lib/db";
import { formatNumber, formatRp, parseLocaleNumber } from "@/lib/format";
import { computeCost } from "@/lib/menus";
import { createSale, materialUsage, type CartLine } from "@/lib/sales";
import { seedIfEmpty } from "@/lib/seed";

export const Route = createFileRoute("/kasir")({
  head: () => ({
    meta: [
      { title: "Kasir — Quinos POS Coffee Shop" },
      {
        name: "description",
        content:
          "Catat penjualan coffee shop dengan cepat; stok bahan baku otomatis berkurang sesuai resep tiap menu.",
      },
      { property: "og:title", content: "Kasir — Quinos POS Coffee Shop" },
      {
        property: "og:description",
        content: "Pilih menu, hitung total, dan stok bahan langsung terpotong dari resep.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KasirPage,
});

function KasirPage() {
  const [ready, setReady] = useState(false);

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
      <AppShell title="Kasir">
        <p className="text-sm text-muted-foreground">Memuat data lokal…</p>
      </AppShell>
    );
  }
  return <KasirView />;
}

function KasirView() {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountInput, setDiscountInput] = useState("");
  const [payment, setPayment] = useState<Sale["paymentMethod"]>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);

  const menus = useLiveQuery(async () => db.menus.toArray(), [], []);
  const categories = useLiveQuery(
    async () => (await db.categories.toArray()).sort((a, b) => a.sortOrder - b.sortOrder),
    [],
    [],
  );
  const materials = useLiveQuery(async () => db.materials.toArray(), [], []);
  const recipes = useLiveQuery(async () => db.recipes.toArray(), [], []);

  const menuById = useMemo(() => new Map(menus.map((m) => [m.id, m])), [menus]);
  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  const visibleMenus = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menus
      .filter((m) => m.isActive === 1)
      .filter((m) => categoryId === "all" || m.categoryId === categoryId)
      .filter(
        (m) => !q || m.name.toLowerCase().includes(q) || (m.code ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [menus, query, categoryId]);

  const lines = cart
    .map((l) => {
      const menu = menuById.get(l.menuItemId);
      if (!menu) return null;
      const gross = menu.price * l.qty;
      return { line: l, menu, gross, net: gross - l.discount };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const subtotal = lines.reduce((s, l) => s + l.gross, 0);
  const lineDiscount = lines.reduce((s, l) => s + l.line.discount, 0);
  const billDiscount = Math.min(
    Math.max(parseLocaleNumber(discountInput), 0),
    Math.max(subtotal - lineDiscount, 0),
  );
  const total = subtotal - lineDiscount - billDiscount;
  const estCost = lines.reduce(
    (s, l) => s + computeCost(l.menu, recipes, materialById) * l.line.qty,
    0,
  );

  /** Bahan yang akan minus kalau keranjang ini dibayar. */
  const shortages = useMemo(() => {
    const need = materialUsage(cart, recipes);
    const out: { name: string; need: number; stock: number; unit: string }[] = [];
    for (const [materialId, qty] of need) {
      const mat = materialById.get(materialId);
      if (mat && mat.currentStock < qty) {
        out.push({ name: mat.name, need: qty, stock: mat.currentStock, unit: mat.unit });
      }
    }
    return out;
  }, [cart, recipes, materialById]);

  function addToCart(menuItemId: string) {
    setCart((prev) => {
      const found = prev.find((l) => l.menuItemId === menuItemId);
      if (found) {
        return prev.map((l) => (l.menuItemId === menuItemId ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { menuItemId, qty: 1, discount: 0 }];
    });
  }

  function setQty(menuItemId: string, qty: number) {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.menuItemId !== menuItemId)
        : prev.map((l) => (l.menuItemId === menuItemId ? { ...l, qty } : l)),
    );
  }

  function resetCart() {
    setCart([]);
    setDiscountInput("");
    setNote("");
    setPayment("cash");
  }

  async function pay() {
    if (cart.length === 0) {
      toast.error("Keranjang masih kosong");
      return;
    }
    setSaving(true);
    try {
      const sale = await createSale({
        lines: cart,
        paymentMethod: payment,
        discount: billDiscount,
        note,
      });
      setReceipt(sale);
      resetCart();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan transaksi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Kasir"
      description="Pilih menu, lalu simpan transaksi. Stok bahan otomatis terpotong sesuai resep."
      actions={
        <Button variant="outline" onClick={() => setHistoryOpen(true)}>
          <History className="size-4" /> Riwayat
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Daftar menu */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari menu atau kode…"
                className="pl-9"
              />
            </div>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kategori</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {visibleMenus.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Tidak ada menu yang cocok.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visibleMenus.map((m) => {
                const inCart = cart.find((l) => l.menuItemId === m.id)?.qty ?? 0;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addToCart(m.id)}
                    className="relative rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-secondary"
                  >
                    <p className="line-clamp-2 text-sm font-medium">{m.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{formatRp(m.price)}</p>
                    {inCart ? (
                      <Badge className="absolute right-2 top-2">{inCart}</Badge>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Keranjang */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-lg font-semibold">Keranjang</h2>

            {lines.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                Belum ada item. Klik menu di sebelah kiri.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {lines.map(({ line, menu, net }) => (
                  <div key={line.menuItemId} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{menu.name}</p>
                      <p className="text-xs text-muted-foreground">{formatRp(menu.price)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label={`Kurangi ${menu.name}`}
                        onClick={() => setQty(menu.id, line.qty - 1)}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="w-6 text-center text-sm tabular-nums">{line.qty}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label={`Tambah ${menu.name}`}
                        onClick={() => setQty(menu.id, line.qty + 1)}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                    <span className="w-20 text-right text-sm tabular-nums">{formatRp(net)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <div className="grid gap-1.5">
                <Label htmlFor="discount">Diskon nota (Rp)</Label>
                <Input
                  id="discount"
                  inputMode="decimal"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="payment">Pembayaran</Label>
                <Select
                  value={payment}
                  onValueChange={(v) => setPayment(v as Sale["paymentMethod"])}
                >
                  <SelectTrigger id="payment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Tunai</SelectItem>
                    <SelectItem value="qris">QRIS</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="note">Catatan (opsional)</Label>
                <Input
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Atas nama Rina, dine-in"
                />
              </div>
            </div>

            {shortages.length ? (
              <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
                <p className="flex items-center gap-1.5 font-medium text-destructive">
                  <TriangleAlert className="size-3.5" /> Stok tidak cukup
                </p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {shortages.map((s) => (
                    <li key={s.name}>
                      {s.name}: butuh {formatNumber(s.need)} {s.unit}, sisa{" "}
                      {formatNumber(s.stock)} {s.unit}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
              <Row label="Subtotal" value={formatRp(subtotal)} />
              {lineDiscount + billDiscount > 0 ? (
                <Row label="Diskon" value={`− ${formatRp(lineDiscount + billDiscount)}`} />
              ) : null}
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatRp(total)}</span>
              </div>
              <Row label="Estimasi HPP" value={formatRp(estCost)} />
              <Row label="Estimasi laba" value={formatRp(total - estCost)} />
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                onClick={resetCart}
                disabled={cart.length === 0 || saving}
                aria-label="Kosongkan keranjang"
              >
                <Trash2 className="size-4" />
              </Button>
              <Button
                className="flex-1"
                onClick={pay}
                disabled={cart.length === 0 || saving || shortages.length > 0}
              >
                {saving ? "Menyimpan…" : `Bayar ${formatRp(total)}`}
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <SalesHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
      <ReceiptDialog sale={receipt} onOpenChange={(v) => !v && setReceipt(null)} />
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
