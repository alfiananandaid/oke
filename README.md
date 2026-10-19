# Automatic Document Feeder (ADF) — Starter Package

Paket awal ADF: Apps Script backend, GitHub Pages frontend, contoh proxy CORS, database Google Sheets, Google Drive, workflow approval, session, dan SLA.

> Status: source code starter untuk ditinjau dan diuji. Belum dideploy, belum tersambung ke akun Google Anda, dan belum diuji terhadap data produksi.

## Struktur
- `apps-script/Code.gs` — backend Google Apps Script
- `github-frontend/` — frontend statis untuk GitHub Pages
- `proxy/worker.js` — contoh Cloudflare Worker proxy untuk origin GitHub Pages

## Arsitektur yang direkomendasikan
GitHub Pages → HTTPS proxy yang dibatasi ke origin Anda → Apps Script Web App → Google Sheets / Drive.

Alternatif paling sederhana untuk prototipe adalah menyajikan frontend melalui Apps Script HTML Service dan menggunakan `google.script.run`. Jika tetap memakai GitHub Pages, jangan menyimpan secret Apps Script di JavaScript publik.

## Setup database dan Apps Script
1. Buat Google Spreadsheet baru khusus ADF.
2. Buka **Extensions → Apps Script**.
3. Salin isi `apps-script/Code.gs` ke `Code.gs`.
4. Pastikan project timezone `Asia/Jakarta`.
5. Jalankan `setupADF()` dari editor Apps Script dan setujui izin Google Sheets/Drive/Calendar yang diminta.
6. Periksa sheet yang dibuat: `UserLogin`, `DataMaster`, `ProposalName`, `CausedBy`, `ADF_Transactions`, `ADF_ApprovalLogs`, `ADF_ActivityLogs`, `ADF_SLA`, `ADF_Settings`, `ADF_Notifications`.
7. Tambahkan data master dan daftar proposal/penyebab sesuai format header.
8. Buat akun pertama dari editor dengan helper `createADFUser(...)`. Password minimum 12 karakter. Password disimpan sebagai SHA-256 hash, bukan plaintext.
   Example:
   ```javascript
   createADFUser('admin01', 'Use-A-Long-Unique-Password!', 'ADF Admin', 'ADM', 'ALL', 'ACTIVE');
   ```
   Ganti contoh dengan password unik. Jangan menaruh password nyata di file yang dibagikan atau GitHub.
9. Jalankan `installADFTriggers()` jika perlu memasang ulang trigger.
10. Deploy → New deployment → Web app. Pilih **Execute as: Me** dan atur akses berdasarkan kebijakan organisasi. Menjalankan sebagai pemilik membuat backend bertindak dengan izin pemilik; endpoint wajib divalidasi ketat. Jangan membuka akses publik untuk data sensitif tanpa review keamanan.
11. Simpan URL `/exec` di konfigurasi secret proxy, bukan di repository publik jika URL tersebut dianggap internal. URL deployment sendiri bukan pengganti autentikasi.

## Menghubungkan GitHub Pages
1. Push isi `github-frontend/` ke repository GitHub.
2. Aktifkan Pages dari branch/folder yang benar.
3. Deploy proxy HTTPS (contoh `proxy/worker.js`) dan ubah `ALLOWED_ORIGINS` menjadi origin GitHub Pages Anda.
4. Set secret Worker `ADF_APPS_SCRIPT_URL` ke URL deployment Apps Script `/exec`.
5. Atur `API_BASE` di `github-frontend/app.js` ke URL proxy Worker.
6. Uji health endpoint, login, sesi, dan role/place sebelum memasukkan data nyata.

Apps Script Web App memiliki batasan CORS/redirect yang berbeda dari server API biasa. Jangan mengandalkan `mode: no-cors`; responsnya tidak bisa dibaca frontend. Uji deployment nyata dari origin GitHub Pages sebelum digunakan.

## Struktur sheet
Header lengkap ditentukan di objek `ADF.SHEETS` pada `Code.gs`. `setupADF()` bersifat idempotent: membuat sheet yang hilang dan menambahkan header yang belum ada tanpa menghapus baris data.

## Menambah pengguna
Jalankan helper di Apps Script editor:
```javascript
createADFUser('staff01', 'Password-Unik-Minimal-12!', 'Nama Staff', 'STAFF', 'T327', 'ACTIVE');
```
Role: `STAFF`, `ADM`, `MGR`, `MSO`, `BUYER`. Place dapat berupa kode store atau `ALL`.

## SLA dan kalender
- Zona waktu: Asia/Jakarta.
- Jam kerja awal: 09.00–17.00 WIB.
- Sabtu/Minggu tidak dihitung.
- Untuk libur nasional, buat/konfigurasikan kalender Google Calendar yang berisi event hari libur sepanjang hari, lalu isi `HOLIDAY_CALENDAR_ID` di `ADF_Settings`. Pastikan akun yang menjalankan Apps Script memiliki akses kalender tersebut.
- SLA saat ini menghitung hari kerja dengan target hari kerja penuh, bukan menghitung menit SLA yang tersisa dalam jam kerja secara presisi. Untuk production, validasi aturan jam cut-off dan kalender libur.

## Session dan keamanan
- Sesi maksimum 12 jam; login baru mengganti token aktif akun.
- `SessionToken` disimpan dalam bentuk hash.
- `deviceId` pada frontend adalah penanda browser lokal, bukan fingerprint yang tidak dapat dipalsukan.
- Helper password menggunakan SHA-256 untuk starter; untuk production, utamakan identity provider terkelola atau mekanisme password hashing yang lebih kuat dengan salt dan faktor tambahan.
- IP pengunjung tidak tersedia secara andal dari Apps Script standar. Jika IP wajib dicatat, catat pada proxy yang terkontrol dan kirim nilainya ke backend melalui jalur tepercaya. Jangan menerima IP dari field bebas browser.
- Koordinat memerlukan izin browser. Pengguna dapat menolak izin; sistem harus menerima status tidak tersedia.
- Watermark: Apps Script tidak memiliki native image compositing. Starter membuat metadata SVG companion dan menyimpan gambar asli; ini **belum** menempelkan watermark secara permanen ke piksel foto. Untuk watermark permanen, tambahkan image compositor server-side yang tervalidasi dan simpan output hasil komposit.
- Review otorisasi setiap aksi, terutama `ALL`, edit transaksi, Store feedback, buyer review, dan final approval sebelum production.

## Catatan keterbatasan starter yang harus diselesaikan sebelum production
1. Tambahkan fitur admin untuk mengubah/membuka kembali transaksi dan validasi kolom wajib per tahap.
2. Implementasikan upload foto dari UI, geolocation capture, serta watermark yang benar-benar terkomposit.
3. Lengkapi transisi status Store → Buyer review sesuai SOP final; uji seluruh sendback berulang.
4. Lengkapi notifikasi email/chat dan SLA minute-accurate.
5. Tambahkan rate limiting, lockout, password hashing produksi, CSRF/origin controls di proxy, backup, dan pengujian keamanan.
6. Pastikan role BUYER dapat mengakses transaksi lintas Place hanya jika kebijakan mengizinkan; default starter tetap menerapkan Place akun.
7. IP address tidak otomatis terisi oleh Apps Script; gunakan proxy tepercaya jika dibutuhkan.
8. Uji concurrency nomor transaksi, izin Drive, kuota Apps Script, dan batas ukuran foto.

## Tes minimal sebelum go-live
- Akun INACTIVE gagal login.
- Password salah tidak membuat sesi.
- Login perangkat kedua membatalkan token perangkat pertama.
- Token kedaluwarsa setelah 12 jam.
- User Place T327 tidak dapat membaca/mengubah T391.
- STAFF tidak dapat approve ADM/MGR/MSO/BUYER.
- Sendback tanpa feedback ditolak.
- Produk master mengisi nilai dari DataMaster di backend.
- Produk non-master diberi flag dan ditinjau ADM.
- Nomor transaksi tidak ganda saat dua simpan bersamaan.
- SLA tidak bertambah pada Sabtu/Minggu dan tanggal libur yang ada di kalender.
