# Changelog kandidat publik

## 0.8.18 — 2026-09-17

- Menambahkan dialog bantuan pintasan dan navigasi keyboard antartab untuk alur kerja desktop yang lebih cepat.
- Menambahkan pilihan periode cepat pada Rekap serta preset narasi kegiatan ASN pada form lengkap dan Catat Cepat.
- Memperjelas indikator streak, tooltip heatmap, tema gelap, dan perilaku `prefers-reduced-motion` tanpa mengubah skema database 10 kolom.
- Menyelaraskan cache Service Worker ke `ekinerja-shell-v0.8.18`; 75 kelompok regresi deterministik lulus pada dua build berurutan dengan hash bundle identik.
- Source yang sama telah dipasang pada deployment produksi Apps Script Version 50 dan diverifikasi memuat badge v0.8.18 serta dialog pintasan.

## 0.8.17 — 2026-09-16

- Menambahkan menu **Hapus kegiatan** pada formulir edit dengan dialog konfirmasi yang menjelaskan dampak pada kalender, Kanban, rekap, snapshot WFH, dan lampiran Drive.
- Menambahkan endpoint penghapusan dengan `ScriptLock`, optimistic locking berbasis `Revisi`, retry idempoten setelah respons jaringan hilang, serta penolakan saat unggahan file masih berjalan.
- Mempertahankan file lampiran di Drive pemilik dan membuat snapshot lama gagal tertutup jika kegiatan sumber sudah dihapus.
- Menambah regresi backend dan UI; total 73 kelompok tes deterministik lulus.
- Menambahkan ledger provenance aset, menetralkan nama SVG aplikasi, mencatat lisensi Inter, dan menambah gate yang menolak nama atau klaim yang menyiratkan afiliasi resmi Google.

## 0.8.16 — 2026-09-15

- Menyatukan Profil, pilihan kegiatan, dan pratinjau nonmodal dalam ruang kerja WFH adaptif.
- Mempertahankan snapshot dan optimistic locking lintas sesi sebelum cetak/ekspor.
- Memvalidasi PDF di server berdasarkan MIME, signature `%PDF-`, ukuran minimum, dan SHA-256 sebelum ekspor ditandai selesai.
- Membuat build Apps Script reproducible tanpa timestamp volatil.
- Menambahkan service worker, manifest, aset ikon, server pratinjau, benchmark, dan generator ikon ke paket publik.
- Memperluas scan privasi untuk path internal, URL Sheet/Docs/deployment, pengenal pribadi, credential, dan file di luar allowlist.

## 0.8.5 — 2026-09-12

- Lisensi MIT ditambahkan untuk kode dan aset asli dalam paket publik; `package.json` diselaraskan.
- Tombol pratinjau laporan WFH dipindah dari kelompok filter ke area tindakan setelah tabel. Jumlah kegiatan terpilih dan pilihan yang tersembunyi oleh filter ditampilkan jelas.
- Pratinjau dan ekspor tetap memakai snapshot terverifikasi yang sama.

## 0.8.4 — 2026-09-12

- Memperjelas dialog distribusi: salinan Sheet kosong tidak membawa source Apps Script atau deployment.
- Menambahkan langkah pemasangan kode dan deployment milik penerima sebelum template disebut aplikasi siap pakai.
- Menyamakan label versi yang terlihat dengan versi backend.

## 0.8.3 — 2026-09-12

- Mempertahankan fitur pencatatan harian, Kanban, profil, lampiran Drive privat, dan pratinjau/ekspor WFH dari v0.8.2.
- Menutup race condition pada dua request upload dengan `uploadSessionId` yang sama melalui klaim `uploading` di bawah `ScriptLock`.
- Memperbaiki recovery agar klaim upload aktif tidak ditandai gagal sebelum eksekusi pertama selesai.
- Kandidat paket dibangun hanya dari source dan tes sintetis. Lisensi dan uji instalasi lintas akun masih menjadi gate publikasi.
