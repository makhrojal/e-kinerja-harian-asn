# Keamanan dan privasi

Jangan unggah spreadsheet kegiatan, profil, lampiran, file laporan WFH, `.clasp.json`, Script Properties, token, atau log privat ke GitHub. Pakai data sintetis untuk laporan bug.

Deploy web app pribadi dengan `executeAs: USER_DEPLOYING` dan `access: MYSELF`. Setiap salinan harus menjalankan `setupInstallation()` agar binding script dan spreadsheet miliknya tercatat. Jangan memperluas akses deployment tanpa uji akun berbeda dan review risiko data.

Google Drive dan Google Sheets tidak memiliki transaksi gabungan. Upload memakai `uploadSessionId` dan checkpoint untuk pemulihan, tetapi uji cloud lintas akun dan fault injection nyata masih terbuka pada kandidat rilis ini.

Untuk masalah keamanan, hubungi maintainer secara privat melalui kanal yang ia sediakan sebelum membuat issue publik. Jangan masukkan data pribadi atau bukti kerja ke issue.
