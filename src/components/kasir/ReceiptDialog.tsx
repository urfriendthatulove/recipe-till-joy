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
import { getIminPrinter, type IminPrinterInstance } from "@/lib/iminPrinter";
import { PAYMENT_LABEL } from "@/lib/sales";

const IMIN_PAGE_WIDTH_DOTS = 384; // usable dot width on iMin's 58mm printer
const IMIN_DIVIDER_CHARS = 32;
const IMIN_BITMAP_PADDING = 12;
const IMIN_BITMAP_THRESHOLD = 190;

type ReceiptLine = {
  text: string;
  align: "left" | "center";
  size: number;
  weight: "400" | "500" | "600" | "700";
};

function toAsciiThermal(value: string) {
  return value
    .replace(/×/g, "x")
    .replace(/•/g, "-")
    .replace(/−/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E\n]/g, "");
}

function buildThermalRow(label: string, value: string) {
  const left = toAsciiThermal(label).trim();
  const right = toAsciiThermal(value).trim();
  const maxLeft = Math.max(1, IMIN_DIVIDER_CHARS - right.length - 1);
  const clippedLeft = left.length > maxLeft ? `${left.slice(0, Math.max(0, maxLeft - 1))}.` : left;
  const spaces = " ".repeat(Math.max(1, IMIN_DIVIDER_CHARS - clippedLeft.length - right.length));
  return `${clippedLeft}${spaces}${right}`;
}

function buildReceiptLines(sale: Sale) {
  const lines: ReceiptLine[] = [
    { text: "RAKYAT COFFEE'S", align: "center" as const, size: 30, weight: "700" as const },
    { text: "POS", align: "center" as const, size: 23, weight: "700" as const },
    { text: "", align: "left" as const, size: 12, weight: "400" as const },
    {
      text: toAsciiThermal(sale.saleNumber),
      align: "center" as const,
      size: 20,
      weight: "600" as const,
    },
    {
      text: toAsciiThermal(formatTanggalJam(sale.createdAt)),
      align: "center" as const,
      size: 18,
      weight: "400" as const,
    },
    {
      text: "-".repeat(IMIN_DIVIDER_CHARS),
      align: "left" as const,
      size: 18,
      weight: "400" as const,
    },
  ];

  for (const item of sale.items) {
    lines.push({
      text: buildThermalRow(`${item.qty}x ${item.nameSnapshot}`, formatRp(item.lineNet)),
      align: "left" as const,
      size: 20,
      weight: "600" as const,
    });
  }

  lines.push({
    text: "-".repeat(IMIN_DIVIDER_CHARS),
    align: "left" as const,
    size: 18,
    weight: "400" as const,
  });
  lines.push({
    text: buildThermalRow("Subtotal", formatRp(sale.subtotal)),
    align: "left" as const,
    size: 20,
    weight: "500" as const,
  });

  if (sale.discount > 0) {
    lines.push({
      text: buildThermalRow("Diskon", `- ${formatRp(sale.discount)}`),
      align: "left" as const,
      size: 20,
      weight: "500" as const,
    });
  }

  lines.push({
    text: buildThermalRow("TOTAL", formatRp(sale.netSales)),
    align: "left" as const,
    size: 22,
    weight: "700" as const,
  });
  lines.push({
    text: buildThermalRow("Pemb", PAYMENT_LABEL[sale.paymentMethod]),
    align: "left" as const,
    size: 20,
    weight: "500" as const,
  });
  lines.push({
    text: "-".repeat(IMIN_DIVIDER_CHARS),
    align: "left" as const,
    size: 18,
    weight: "400" as const,
  });

  const note = sale.note?.trim();
  if (note) {
    lines.push({
      text: toAsciiThermal(`Catatan: ${note}`),
      align: "center" as const,
      size: 18,
      weight: "400" as const,
    });
  }

  lines.push({ text: "TERIMA KASIH", align: "center" as const, size: 20, weight: "700" as const });
  return lines;
}

function thresholdReceiptBitmap(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
) {
  const imageData = context.getImageData(0, 0, canvasWidth, canvasHeight);

  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index] ?? 255;
    const green = imageData.data[index + 1] ?? 255;
    const blue = imageData.data[index + 2] ?? 255;
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
    const value = luminance >= IMIN_BITMAP_THRESHOLD ? 255 : 0;

    imageData.data[index] = value;
    imageData.data[index + 1] = value;
    imageData.data[index + 2] = value;
    imageData.data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
}

function printReceiptAsBitmap(printer: IminPrinterInstance, sale: Sale) {
  if (typeof document === "undefined") {
    throw new Error("Bitmap receipt membutuhkan DOM.");
  }

  const lines = buildReceiptLines(sale);
  const canvas = document.createElement("canvas");
  const lineHeights = lines.map((line) => Math.ceil(line.size * 1.45));
  const contentHeight = lineHeights.reduce((sum, height) => sum + height, 0);
  const canvasWidth = IMIN_PAGE_WIDTH_DOTS;
  const canvasHeight = contentHeight + IMIN_BITMAP_PADDING * 2;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context tidak tersedia untuk bitmap bon.");
  }

  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = "#000000";
  context.textBaseline = "top";
  context.imageSmoothingEnabled = false;

  let y = IMIN_BITMAP_PADDING;
  for (const [index, line] of lines.entries()) {
    const lineHeight = lineHeights[index] ?? Math.ceil(line.size * 1.45);
    context.font = `${line.weight} ${line.size}px Arial`;

    const textWidth = context.measureText(line.text).width;
    let x = IMIN_BITMAP_PADDING;
    if (line.align === "center") {
      x = Math.max(IMIN_BITMAP_PADDING, (canvasWidth - textWidth) / 2);
    }

    context.fillText(line.text, x, y);
    y += lineHeight;
  }

  thresholdReceiptBitmap(context, canvasWidth, canvasHeight);

  printer.initPrinter(printer.PrintConnectType.SPI);
  printer.setPageFormat(1);
  printer.setTextWidth(IMIN_PAGE_WIDTH_DOTS);
  printer.setLeftMargin(0);
  printer.printSingleBitmap?.(canvas.toDataURL("image/png"));
  printer.printAndFeedPaper(80);
  printer.partialCut();
}

function printReceiptViaIminSdk(printer: IminPrinterInstance, sale: Sale) {
  if (printer.printSingleBitmap) {
    printReceiptAsBitmap(printer, sale);
    return;
  }

  printer.initPrinter(printer.PrintConnectType.SPI);
  printer.setPageFormat(1);
  printer.setTextWidth(IMIN_PAGE_WIDTH_DOTS);
  printer.setLeftMargin(0);
  printer.setTextTypeface?.(1);
  printer.setTextLineSpacing?.(1);

  const divider = "-".repeat(IMIN_DIVIDER_CHARS);
  const printLine = (text: string) => printer.printText(`${toAsciiThermal(text)}\n`, 0);

  printer.setAlignment(1);
  printer.setTextStyle(1);
  printer.setTextSize(24);
  printLine("RAKYAT COFFEE'S");

  printer.setTextSize(22);
  printLine("POS");

  printer.setTextStyle(0);
  printer.setTextSize(20);
  printLine(sale.saleNumber);
  printLine(formatTanggalJam(sale.createdAt));

  printer.setAlignment(0);
  printLine(divider);

  for (const item of sale.items) {
    const itemLabel = `${item.qty}x ${item.nameSnapshot}`;
    printLine(buildThermalRow(itemLabel, formatRp(item.lineNet)));
  }

  printLine(divider);

  printLine(buildThermalRow("Subtotal", formatRp(sale.subtotal)));
  if (sale.discount > 0) {
    printLine(buildThermalRow("Diskon", `- ${formatRp(sale.discount)}`));
  }
  printer.setTextStyle(1);
  printer.setTextSize(22);
  printLine(buildThermalRow("TOTAL", formatRp(sale.netSales)));
  printer.setTextStyle(0);
  printer.setTextSize(20);
  printLine(buildThermalRow("Pemb", PAYMENT_LABEL[sale.paymentMethod]));

  printLine(divider);

  printer.setAlignment(1);
  const note = sale.note?.trim();
  if (note) {
    printLine(`Catatan: ${note}`);
  }
  printer.setTextStyle(1);
  printer.setTextSize(20);
  printLine("TERIMA KASIH");

  printer.printAndFeedPaper(80);
  printer.partialCut();
}

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
            font-family: "Consolas", "Courier New", "Arial", "Helvetica", sans-serif;
            font-size: 13px;
            line-height: 1.4;
            font-weight: 700;
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: none;
            font-smooth: never;
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
            font-size: 17px;
            font-weight: 700;
            letter-spacing: 0.02em;
            margin: 2px 0 6px;
          }

          .title {
            font-size: 13px;
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
            font-weight: 700;
          }

          .row {
            display: flex;
            justify-content: space-between;
            gap: 6px;
            margin: 2px 0;
          }

          .row.total {
            font-size: 15px;
            font-weight: 700;
            padding-top: 2px;
          }

          .footer {
            text-align: center;
            font-size: 12px;
            font-weight: 700;
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
              -webkit-font-smoothing: none;
              font-smooth: never;
              filter: contrast(1.6) brightness(0.85);
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
  const iminPrinter = getIminPrinter();
  if (iminPrinter) {
    try {
      printReceiptViaIminSdk(iminPrinter, sale);
      return;
    } catch (error) {
      console.warn(
        "Gagal cetak lewat SDK printer iMin, pakai print browser sebagai fallback.",
        error,
      );
    }
  }

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
