# E-Kinerja Harian ASN

Aplikasi pencatatan kegiatan pribadi berbasis Google Sheets dan Google Apps Script. Ini alat bantu kerja mandiri, bukan portal resmi BKN atau sistem penilaian SKP.

**Status paket:** Beta v0.8.17 berlisensi MIT. Source telah melewati 73 kelompok regresi deterministik dan pemindaian privasi; uji akun Google kedua serta perangkat fisik tetap bagian dari pengujian Beta.

Kode dan aset asli dalam paket ini menggunakan [lisensi MIT](LICENSE). Asal aset, icon generator, dan batas penggunaan merek dicatat dalam [Asset provenance](ASSET-PROVENANCE.md). Merek dan layanan Google tetap milik pemegang hak masing-masing; aplikasi ini bukan produk resmi Google atau BKN.

## Isi paket

- `Kode.gs`: bundle siap tempel ke editor Apps Script.
- `appsscript.json`: manifest izin dan akses web app pribadi.
- `Server.gs`, `Index.html`, `client-domain.js`, `client-sync.js`, `build.mjs`: source modular.
- `test.mjs` dan `release-v0.3.1/regression.mjs`: regresi deterministik.
- `serve.mjs`, `sw.js`, manifest, dan `assets/`: pratinjau lokal serta aset PWA.

## Pemasangan pribadi

1. Buat spreadsheet kosong di akun Google Anda sendiri. Setel zona waktu spreadsheet ke `Asia/Jakarta`, `Asia/Makassar`, atau `Asia/Jayapura`.
2. Ubah nama tab awal menjadi `Catatan Harian`. Isi baris pertama persis dengan sepuluh header berikut, berurutan: `ID`, `Tanggal`, `Kegiatan`, `Hasil`, `Bukti`, `Status`, `Tindak lanjut`, `Dibuat`, `Diperbarui`, `Revisi`.
3. Dari spreadsheet itu buka **Ekstensi → Apps Script**. Ganti isi file kode bawaan dengan isi `Kode.gs`. Aktifkan tampilan file manifest di pengaturan editor, lalu gunakan isi `appsscript.json`.
4. Simpan dan muat ulang spreadsheet. Jalankan menu **E-Kinerja ASN → Siapkan salinan ini**, lalu selesaikan izin Google yang ditampilkan. Izin Drive dipakai untuk lampiran dan laporan; izin tersebut bukan terbatas ke satu folder.
5. Di Apps Script pilih **Deploy → New deployment → Web app**. Jalankan sebagai pemilik akun dan pilih akses **Only myself / Hanya saya sendiri** untuk catatan pribadi. Buka URL `/exec` yang dibuat untuk akun Anda.

Menyalin spreadsheet saja tidak otomatis menyalin source/deployment Apps Script. Setiap pemasang harus menyelesaikan langkah 3–5 pada akun sendiri. Jangan membagikan URL `/exec` atau spreadsheet operasional milik orang lain sebagai template.

## Penggunaan dan batas saat ini

- Data inti tetap berada pada sepuluh kolom `Catatan Harian`; profil, lampiran, dan snapshot laporan memakai tab pendukung di spreadsheet yang sama.
- Lampiran disimpan privat di Google Drive pemilik. Batas aplikasi saat ini 5 file per kegiatan, 10 MB per file, dengan format PDF, DOCX, XLSX, JPEG, atau PNG.
- Laporan WFH dibuat dari kegiatan yang dipilih secara eksplisit. Periksa pratinjau sebelum membuat Google Docs, DOCX, atau PDF.
- Untuk menghapus kegiatan, buka kegiatan dari Home, Kalender, atau Kanban, pilih **Edit**, lalu klik **Hapus kegiatan**. Aplikasi memeriksa revisi terbaru dan meminta konfirmasi dampak; file lampiran tetap berada di Drive pemilik.
- Fitur dan hak akses tambahan harus diuji pada salinan pribadi sebelum digunakan untuk data kerja nyata.

## Build dan tes

Jalankan `npm test` dengan Node.js. Perintah itu membangun ulang `Kode.gs` dan menjalankan regresi deterministik. Di Windows PowerShell gunakan `npm.cmd test`.

Tes lokal belum menggantikan uji instalasi dua akun Google, pengukuran performa cloud, atau perangkat mobile fisik. Jalankan `npm run verify:public` sebelum membuat rilis atau pull request.

## Privasi

Paket ini tidak memuat spreadsheet, profil, dokumen laporan, file lampiran, token, atau deployment milik pembuat. Aplikasi web dijalankan dari deployment yang dibuat oleh pemasang pada akun mereka sendiri. Lihat [SECURITY.md](SECURITY.md) untuk batas distribusi dan pelaporan masalah.
