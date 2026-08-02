const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const rupiahPrecise = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const angka = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

/** Rp 15.000 */
export const formatRp = (value: number) => rupiah.format(Math.round(value));

/** Rp 18,5 — untuk harga per satuan kecil (per ml / per gram) */
export const formatRpPrecise = (value: number) => rupiahPrecise.format(value);

/** 1.250,5 */
export const formatNumber = (value: number) => angka.format(value);

const tanggal = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const tanggalJam = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatTanggal = (iso: string) => tanggal.format(new Date(iso));
export const formatTanggalJam = (iso: string) => tanggalJam.format(new Date(iso));

/** Ubah "12.500" / "12,5" hasil ketikan kasir jadi number */
export function parseLocaleNumber(input: string): number {
  const cleaned = input.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
