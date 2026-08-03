# Kasir Cerdas

<peran>

Kamu adalah senior full-stack engineer yang berpengalaman membangun aplikasi POS/inventory sederhana untuk UMKM (F&B), menggunakan React + TypeScript + Vite + Tailwind CSS.

</peran>

<konteks>

Saya punya coffee shop dan ingin membuat web app (dipakai di browser, laptop/tablet di kasir) untuk mencatat penjualan sekaligus melacak pemakaian stok bahan baku secara otomatis berdasarkan resep.

Contoh kasusnya: kalau saya jual 1 gelas Latte, sistem otomatis mengurangi stok susu, kopi, dll sesuai takaran resepnya (misal: 1 liter susu dipakai untuk membuat 10 gelas kopi susu — jadi tiap 1 gelas terjual = stok susu berkurang 100ml).

Saya sudah punya contoh data laporan penjualan dari sistem kasir lama (format Excel/CSV), terlampir sebagai referensi struktur data. Formatnya per kategori menu (contoh: Classic Coffee, Kopi 15rb, Milky Series, Tea, Signature Drinks, dan menu makanan seperti Nasi/Mie/Rice Bowl/Snacks), dengan kolom: kode item, nama, qty terjual, subtotal, diskon, net sales, cost, profit.

Stack: React + TypeScript + Vite + Tailwind CSS.

</konteks>

<tugas>

Bantu saya rancang dan bangun aplikasi ini secara BERTAHAP (jangan langsung semua fitur sekaligus), dengan urutan:

1. Rancangan struktur data dulu (tampilkan skema, jangan langsung kode):

   - Master Bahan Baku (raw materials): nama, satuan (ml/liter/gram/pcs), stok saat ini, stok minimum (untuk alert)

   - Master Menu: nama menu, kategori (mengikuti kategori di data referensi saya), harga jual

   - Resep/BOM per menu: menu apa memakai bahan baku apa dan berapa takarannya (contoh: Latte = 150ml susu + 18g kopi)

   - Transaksi Penjualan: tanggal/waktu, item terjual, qty, otomatis hitung subtotal & profit (harga jual - cost dari resep)

2. Setelah skema disetujui, bangun modul-modul berikut satu per satu, saya konfirmasi dulu tiap modul sebelum lanjut:

   a. Manajemen Master Bahan Baku (tambah/edit bahan, input stok masuk saat restock, lihat stok saat ini)

   b. Manajemen Master Menu & Resep (tambah/edit menu, atur resep/BOM per menu)

   c. Pencatatan Penjualan (form kasir sederhana: pilih menu, qty, otomatis kurangi stok bahan sesuai resep, hitung total)

   d. Dashboard & Laporan: penjualan harian/mingguan, menu terlaris, sisa stok, notifikasi bahan yang stoknya menipis (di bawah stok minimum), estimasi profit

3. Sertakan validasi penting:

   - Kalau stok bahan tidak cukup untuk sebuah transaksi, sistem harus kasih peringatan (bukan diam-diam tetap mencatat penjualan)

   - Riwayat pemakaian stok harus bisa ditelusuri per transaksi (untuk audit kalau ada selisih stok)

</tugas>

<batasan>

- Data disimpan secara lokal dulu (localStorage/IndexedDB) kecuali saya minta backend — aplikasi harus tetap bisa dipakai walau nanti koneksi internet di tempat saya kurang stabil

- UI harus simpel dan cepat dipakai saat jam sibuk kasir (minim klik untuk mencatat satu transaksi)

- Gunakan format mata uang Rupiah (Rp) dan format angka Indonesia

- Jangan hardcode data menu/bahan baku dari contoh saya sebagai data permanen — jadikan hanya sebagai contoh awal (seed data) yang bisa saya edit sepenuhnya

</batasan>

<format_output>

1. Skema struktur data (poin-poin, boleh pseudo-code/tabel)

2. Setelah saya setujui, baru mulai coding modul pertama (Manajemen Master Bahan Baku), dengan penjelasan singkat tiap bagian penting

3. Tunggu konfirmasi saya sebelum lanjut ke modul berikutnya

</format_output>

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3fbb467f-796f-46b7-9bad-c4fe222b6968).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
