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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildReceiptHtml(sale: Sale) {
  const receiptWidth = "58mm";
  const footerNote = sale.note?.trim() ? `Catatan: ${escapeHtml(sale.note.trim())}` : "";
  const itemsHtml = sale.items
    .map(
      (item) => `
        <tr>
          <td class="item-name">${item.qty}x ${escapeHtml(item.nameSnapshot)}</td>
          <td class="amount">${formatRp(item.lineNet)}</td>
        </tr>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Bon ${escapeHtml(sale.saleNumber)}</title>
        <style>
          @page {
            size: ${receiptWidth} auto;
            margin: 0;
          }

          html {
            width: ${receiptWidth};
            min-width: ${receiptWidth};
            max-width: ${receiptWidth};
          }

          html, body {
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
            font-family: "Arial", "Helvetica", sans-serif;
            font-size: 11px;
            line-height: 1.3;
            font-weight: 400;
            text-rendering: optimizeLegibility;
          }

          body {
            width: ${receiptWidth};
            min-width: ${receiptWidth};
            max-width: ${receiptWidth};
            box-sizing: border-box;
            padding: 7px 6px 10px;
            overflow: hidden;
          }

          .actions {
            width: ${receiptWidth};
            box-sizing: border-box;
            padding: 8px 6px;
            display: flex;
            justify-content: space-between;
            gap: 6px;
          }

          .actions button {
            border: 1px solid #111;
            background: #fff;
            color: #111;
            font: inherit;
            font-size: 11px;
            font-weight: 700;
            padding: 6px;
            width: 100%;
            cursor: pointer;
          }

          .receipt {
            width: 100%;
          }

          .center {
            text-align: center;
          }

          .brand {
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.01em;
            margin: 2px 0 6px;
          }

          .title {
            font-size: 11px;
            font-weight: 700;
            margin-bottom: 4px;
          }

          .meta,
          .totals,
          .footer {
            border-top: 1px dashed #111;
            border-bottom: 1px dashed #111;
            padding: 6px 0;
            margin: 6px 0;
          }

          .meta {
            text-align: center;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          td {
            vertical-align: top;
            padding: 1px 0;
          }

          .item-name {
            word-break: break-word;
            white-space: normal;
            padding-right: 6px;
          }

          .amount {
            text-align: right;
            white-space: nowrap;
            font-weight: 600;
          }

          .row {
            display: flex;
            justify-content: space-between;
            gap: 6px;
            margin: 2px 0;
          }

          .row.total {
            font-size: 12px;
            font-weight: 700;
            padding-top: 2px;
          }

          .footer {
            text-align: center;
            font-size: 10px;
          }

          @media print {
            .actions {
              display: none;
            }

            * {
              text-shadow: none !important;
            }

            html, body {
              margin: 0;
              width: ${receiptWidth};
              min-width: ${receiptWidth};
              max-width: ${receiptWidth};
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              image-rendering: crisp-edges;
            }
          }
        </style>
      </head>
      <body>
        <div class="actions">
          <button type="button" onclick="window.print()">Cetak bon</button>
          <button type="button" onclick="window.close()">Tutup</button>
        </div>

        <div class="receipt">
          <div class="center brand">RAKYAT COFFEE'S</div>
          <div class="center title">POS</div>

          <div class="meta">
            <div>${escapeHtml(sale.saleNumber)}</div>
            <div>${escapeHtml(formatTanggalJam(sale.createdAt))}</div>
          </div>

          <table>
            ${itemsHtml}
          </table>

          <div class="totals">
            <div class="row"><span>Subtotal</span><span>${formatRp(sale.subtotal)}</span></div>
            ${sale.discount > 0 ? `<div class="row"><span>Diskon</span><span>- ${formatRp(sale.discount)}</span></div>` : ""}
            <div class="row total"><span>TOTAL</span><span>${formatRp(sale.netSales)}</span></div>
            <div class="row"><span>Pemb</span><span>${escapeHtml(PAYMENT_LABEL[sale.paymentMethod])}</span></div>
          </div>

          ${footerNote ? `<div class="footer">${footerNote}</div>` : ""}
          <div class="footer" style="border-top: 1px dashed #111; margin-top: 8px; padding-top: 8px;">TERIMA KASIH</div>
        </div>
      </body>
    </html>`;
}

function printReceipt(sale: Sale) {
  const html = buildReceiptHtml(sale);
  const printWindow = window.open("", "_blank", "width=420,height=780");
  if (!printWindow) {
    console.warn("Browser memblokir popup bon. Izinkan popup agar halaman bon bisa dibuka.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
}

export function ReceiptDialog({
  sale,
  onOpenChange,
}: {
  sale: Sale | null;
  onOpenChange: (v: boolean) => void;
}) {
  const handleNewTransaction = () => {
    if (sale) {
      printReceipt(sale);
    }
    onOpenChange(false);
  };

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
            </div>
            <p className="text-xs text-muted-foreground">
              Stok bahan sudah otomatis berkurang sesuai resep.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button onClick={handleNewTransaction}>Transaksi baru</Button>
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
