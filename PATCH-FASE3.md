# PATCH FASE 3 — Analisa & Rencana Perbaikan (TMaps)

Dokumen ini adalah satu-satunya file patch untuk Fase 3. Berisi analisa, temuan yang sudah diverifikasi, cara memastikan fitur ping benar-benar bekerja, dan rencana perbaikan dalam 3 fase. **Tidak ada kode sumber yang diubah.** Sesuai `AGENTS.md`, setiap fase perbaikan dikerjakan satu per satu dan menunggu persetujuan Anda di akhir fase.

Basis analisa: `tmaps-main.zip` yang diunggah (101 file). Dokumen acuan yang dipakai: `flow-aplikasi-network-mapping.md`, `style-guide.md`, `build-plan-3-fase.md`, `README.md`, `AGENTS.md`.

---

## 0. Ringkasan Eksekutif

Ketiga keluhan Anda punya penyebab yang jelas di kode:

| Keluhan | Penyebab utama | Tingkat |
|---|---|---|
| Dropdown notifikasi tidak muncul dari tombol "Notifikasi" di toolbar bawah | Toolbar memiliki tombol notifikasi yang **tidak ada di flow** (flow #3 hanya 7 tool). Handler `handleToolSelect` tidak menangani id `"notifications"`, sehingga dropdown tidak pernah dibuka. Efek samping: klik tombol itu juga mematikan mode Select di peta. | Tinggi |
| Duplikasi di pojok kanan atas | Tiga elemen menempati posisi `top:16px; right:16px` yang sama: lonceng (z-index 25), sidebar detail perangkat (z-index 24, tombol tutup X ada di pojok kanannya), dan panel filter. Ditambah lagi, tombol lonceng kedua di toolbar bawah membuat notifikasi terkesan dobel. Lonceng kanan atas juga kemungkinan **tidak bisa diklik** (lihat temuan A2). | Tinggi |
| Memastikan fitur ping benar-benar bekerja | Mesin ping ada dan arsitekturnya masuk akal, tetapi ada **race condition** di scheduler (tick bisa menumpuk dan menghasilkan ping ganda serta penumpukan proses `ping`), latency diukur dengan selisih waktu wall-clock, dan endpoint status real-time tidak aman serta boros query. Simulasi menunjukkan ping ganda nyata (lihat B1). | Tinggi |

Selain itu ada masalah keamanan dan konsistensi: endpoint status tanpa autentikasi, route monitoring dan notifikasi tanpa pengecekan permission, file migrasi yatim yang bertentangan dengan keputusan #6, dan variabel `PING_CONCURRENCY` yang belum ada di `.env.example`.

---

## 1. Metode dan Batasan Analisa

Yang dilakukan:
- Membaca seluruh kode fase 3 (backend: `monitor.ts`, `routes/monitoring.ts`, `routes/notifications.ts`, `routes/search.ts`, `routes/health.ts`, `schema.ts`, seluruh migrasi; frontend: `NotificationBell.tsx`, `Toolbar.tsx`, `MapShell.tsx`, `MapView.tsx`, `DeviceSidebar.tsx`, `api.ts`, `styles.css`).
- Membandingkan kode dengan flow, style guide, dan build plan.
- Menjalankan simulasi Node.js terhadap algoritma `tick()` dengan waktu dipercepat (1 detik nyata = 10 ms) dengan parameter nyata (tick 5 dtk, timeout 2 dtk, concurrency 10, 100 perangkat). Simulasi ini **model**, bukan eksekusi kode asli, tetapi logikanya dipetakan langsung dari `monitor.ts`.

Yang **belum** bisa saya jalankan di sandbox ini (tidak ada Docker, binary `ping`, PostgreSQL, maupun browser):
- Ping ICMP sungguhan ke perangkat Anda.
- Tampilan dan interaksi UI di browser.

Karena itu, temuan UI ditandai "kode" (dipastikan dari CSS/JSX) atau "perlu verifikasi" (langkah verifikasi disediakan di bagian 4 dan 6).

---

## 2. Status Fase 3 terhadap Build Plan

| Langkah | Status | Catatan singkat |
|---|---|---|
| 3.1 Scheduler ping | **Sebagian** | Loop tick, `spawn` tanpa shell, `ping_logs`, retensi sudah ada. Tapi ada overlap tick (B1), `next_check_at` tidak diperbarui saat error (B2), latency tidak akurat (B3), IP tidak divalidasi ulang sebelum `spawn` (B4). |
| 3.2 Status real-time | **Sebagian** | Polling dan pewarnaan marker berfungsi. Endpoint berada di `/health/status`, tanpa autentikasi (C1), N+1 query, dan `monitoringEnabled` salah. Sidebar tidak ikut diperbarui (C2). |
| 3.3 Notifikasi | **Sebagian** | Skema global (sesuai keputusan #6), badge, fly-to, dan "tandai semua dibaca" ada. Dropdown dari toolbar tidak berfungsi (A1), lonceng kanan atas kemungkinan tidak bisa diklik (A2), dan notifikasi palsu saat pengecekan pertama (A4). |
| 3.4 Search, filter, tag, clustering | **Kode ada, belum diuji** | Filter AND sudah benar (`filteredDevices` di `MapShell.tsx`). Clustering memakai `react-leaflet-cluster` dan dipasang di `MapView.tsx`. Search mencari perangkat, tipe, dan tag. Perlu uji manual. |
| 3.5 Hardening | **Belum** | Tidak ada rate limit login/TOTP (lihat D3, ada konflik dengan flow). Permission belum konsisten (B7). `PING_CONCURRENCY` tidak ada di `.env.example` (D2). |

---

## 3. Temuan Detail

Setiap temuan diberi kode ID untuk dirujuk di rencana perbaikan. Tanda **[verifikasi]** berarti temuan dari kode yang perlu dikonfirmasi di browser atau server Anda.

### A. Notifikasi dan UI pojok kanan atas

**A1. Tombol "Notifikasi" di toolbar bawah tidak berfungsi dan tidak ada di flow.** *(Tinggi)*
- `Toolbar.tsx` mendaftarkan `{ id: "notifications", label: "Notifikasi", icon: Bell }`. Flow #3 hanya mencantumkan 7 tool: Select, Pan, +Perangkat, +Kabel, Search, Clustering, More. Tombol ini adalah fitur di luar spesifikasi, dan `AGENTS.md` melarang hal seperti itu.
- `handleToolSelect` di `MapShell.tsx` tidak punya cabang untuk `"notifications"`, jadi jatuh ke `setActiveTool(tool)`. Dropdown `NotificationBell` hanya dikendalikan oleh state `open` internalnya dan tidak pernah dibuka dari luar.
- Efek samping yang lebih buruk: karena `activeTool` menjadi `"notifications"`, `MapView` menghitung `selectEnabled = false`, sehingga klik perangkat di peta tidak bekerja sampai user memilih Select lagi. Selain itu, `setSidebarId(null)` ikut menutup sidebar.

**A2. Lonceng kanan atas kemungkinan tidak bisa diklik.** *(Tinggi, [verifikasi])*
- `.ui-overlay` memakai `pointer-events: none`. Panel yang harus bisa diklik memakai kelas `.panel` yang menimpa dengan `pointer-events: auto`.
- `.overlay-top-right` **bukan** `.panel` dan tidak punya `pointer-events: auto`. `pointer-events` diwarisi, sehingga `div.overlay-top-right`, `div.notification-bell`, dan `button.icon-button` semuanya menerima `none`. Klik pada lonceng akan tembus ke peta.
- Pembanding yang mendukung: `.overlay-top-left` memakai `.panel` dan bisa diklik. Hanya `.overlay-top-right` yang tidak.
- Cara cek di browser: lihat bagian 4.4.

**A3. "Duplikasi" di pojok kanan atas: tiga elemen bertumpuk di koordinat yang sama.** *(Sedang, kode)*
- Lonceng: `.overlay-top-right { top:16px; right:16px; z-index:25 }`.
- Sidebar detail: `.device-sidebar { top:16px; right:16px; bottom:16px; z-index:24 }`. Tombol tutup "Tutup detail perangkat" ada di header-nya, yaitu di pojok kanan atas, tepat di bawah lonceng yang z-index-nya lebih tinggi. Hasilnya dua ikon bertumpuk di pojok yang sama.
- Panel filter: `.filter-panel { top:16px; right:16px; z-index:20 }` dengan tombol X di pojok kanan atas.
- Flow section 10 mensyaratkan lonceng **tetap terlihat** saat sidebar terbuka, tetapi implementasinya membuat sidebar menutupi area di bawahnya.
- Ditambah lagi tombol lonceng kedua di toolbar (A1), sehingga notifikasi terlihat dobel.
- Saya belum bisa memastikan elemen mana yang Anda maksud dari kode saja. **Mohon kirim screenshot pojok kanan atas.** Rencana perbaikan di Fase 1 mencakup ketiga kemungkinan.

**A4. Notifikasi palsu pada pengecekan pertama.** *(Sedang, kode)*
- `pingDevice` membandingkan `current.status` dengan `newStatus`. Perangkat baru berstatus `unmonitored` (default). Ping pertama yang berhasil membuat `unmonitored → active`, lalu notifikasi "X kembali online" dibuat, padahal perangkat itu tidak pernah offline.
- Melanggar build plan 3.3: "Tidak ada notifikasi ganda untuk perubahan status yang sama" dan notifikasi seharusnya mencerminkan perubahan nyata.

**A5. Hitung unread dan route notifikasi tanpa permission.** *(Rendah)*
- `GET /notifications/unread-count` memuat seluruh baris unread lalu menghitung di JavaScript. Seharusnya `COUNT(*)`.
- `routes/notifications.ts` tidak memakai `requirePermission` sama sekali. Matriks permission (flow Keputusan #4) menyatakan Viewer hanya `R` untuk notifications, tetapi Viewer saat ini bisa memanggil `POST /notifications/:id/read` dan `mark-all-read`.

### B. Mesin ping dan monitoring (dasar keyakinan "ping bekerja")

**B1. Tick bisa menumpuk: ping ganda dan proses `ping` melebihi batas.** *(Tinggi, simulasi)*
- `tick()` dipanggil oleh `setInterval` setiap `PING_TICK_SECONDS` tanpa guard re-entrancy.
- `next_check_at` baru diperbarui **setelah** ping selesai (`pingDevice`, langkah terakhir). Selama ping sebuah device belum selesai, tick berikutnya masih menganggapnya "jatuh tempo" dan mengambilnya lagi.
- `PING_CONCURRENCY` membatasi per tick, bukan secara global. Dengan banyak device yang down (timeout 2 dtk), satu putaran bisa berjalan jauh lebih lama dari tick 5 dtk.

Hasil simulasi (100 device, tick 5 dtk, timeout 2 dtk, concurrency 10, waktu dipercepat):

| Metrik | Versi asli | Versi usulan (klaim + guard) |
|---|---|---|
| Total ping dalam 60 dtk logis | **280** (seharusnya ±100) | 100 |
| Puncak ping paralel (batas 10) | **50** | 10 |
| Device yang di-ping lebih dari sekali | **80**, sampai 5x | 0 |

Dampak nyata: beban proses `ping` di container, data `ping_logs` yang menggandakan, dan kemungkinan notifikasi ganda. Uji "≥ 100 perangkat seed" di build plan 3.1 akan gagal pada versi ini.

**B2. Error di tengah ping membuat device diperiksa ulang setiap tick.** *(Sedang, kode)*
- Jika salah satu langkah di `pingDevice` melempar error (misalnya insert `ping_logs` gagal), `catch` hanya mencatat log. `next_check_at` tidak diperbarui, sehingga device diperiksa lagi tiap 5 detik sampai error hilang.

**B3. Latency diukur dengan selisih waktu, bukan dari output ping.** *(Sedang, kode)*
- `latency = Date.now() - startTime` mencakup waktu spawn proses, bukan round-trip time ICMP. Nilainya selalu sedikit lebih besar dan tidak konsisten antar host.
- Output `ping` memuat `time=12.3 ms` yang lebih akurat. Ini juga yang seharusnya dibandingkan saat Anda memverifikasi (bagian 4).
- Race kecil: timer JavaScript dan `-W` sama-sama 2 dtk, sehingga ping yang balasnya tiba di detik ke-1,9 bisa tetap dianggap gagal karena timer JS lebih dulu menembak.

**B4. IP tidak divalidasi ulang sebelum `spawn`, dan tidak ada pemisah `--`.** *(Sedang, keamanan)*
- Validasi IP ada di `lib/device-rules.ts` saat device disimpan, jadi input jahat sudah tertahan di pintu masuk. Namun `monitor.ts` menerima `ipAddress` dari DB tanpa memvalidasi ulang, dan argumen `ping` tidak diawali `--`. Jika data pernah masuk lewat jalur lain (migrasi manual, SQL langsung), string seperti `-f` atau `-I eth0` akan diperlakukan sebagai opsi `ping`.
- `spawn` tanpa shell sudah benar dan tidak rentan command injection klasik. Ini tinggal pengerasan (defense in depth).

**B5. Satu paket hilang langsung dianggap offline.** *(Sedang, perlu keputusan produk)*
- Tidak ada threshold. Satu kali timeout langsung mengubah status ke `offline` dan membuat notifikasi. Di jaringan nyata ini akan menghasilkan notifikasi "offline" dan "kembali online" yang berisik.
- Usulan: threshold N kegagalan berturut-turut (lihat pertanyaan Q3). Ini perlu kolom baru, sehingga bukan perbaikan kecil.

**B6. Mematikan monitoring tidak mengembalikan status ke `unmonitored`.** *(Sedang, kode)*
- `PUT /devices/:id/monitoring` dengan `enabled: false` hanya mengubah `monitoring_config`. `devices.status` tetap `active` atau `offline`, sehingga marker tetap hijau/merah padahal tidak lagi dimonitor. Flow #10 dan style guide menyatakan marker abu-abu = tidak dimonitor.

**B7. Permission pada route monitoring dan search tidak sesuai matriks.** *(Sedang, keamanan)*
- `PUT /devices/:id/monitoring` memakai `requirePermission("devices", "write")`, padahal matriks menetapkan resource `monitoring`.
- `GET /devices/:id/monitoring` dan `GET /devices/:id/ping-logs` hanya `requireAuth`. Role custom tanpa akses monitoring tetap bisa membaca.
- `GET /search` hanya `requireAuth`, tanpa `devices:read`.
- Ini belum terasa dengan 3 role seed (karena semua seed punya read), tetapi akan bocor begitu ada role baru.

**B8. Job retensi `ping_logs` dan dokumentasi tidak sinkron.** *(Rendah)*
- Keputusan #7 di README menulis "Job cleanup berjalan tiap tick scheduler". Implementasi menjalankannya setiap jam (`setInterval` 60 menit). Keduanya masuk akal, tetapi harus disepakati dan teksnya disamakan (lihat Q5).
- `setInterval` untuk cleanup tidak disimpan handle-nya dan tidak dihentikan saat `stopMonitoring()`.
- `cleanupOldLogs` mencatat "deleted" tanpa jumlah baris.

### C. Status real-time dan sidebar

**C1. Endpoint status ada di tempat yang salah, tanpa autentikasi, boros query, dan datanya salah.** *(Tinggi)*
- Frontend memanggil `GET /health/status` (`api.ts`). Route `/health` dipasang di `app.ts` tanpa `requireAuth`. Akibatnya siapa pun yang tahu URL API bisa mendapatkan daftar UUID seluruh perangkat beserta statusnya.
- Build plan 3.2 meminta `GET /status` yang "ringkas". Implementasi mengambil semua device lalu menjalankan **satu query per device** (`Promise.all` dengan `LIMIT 1`). Dengan 1.000 device, polling 3 dtk berarti 1.000 query setiap 3 detik dari setiap browser yang terbuka.
- `monitoringEnabled: !!ping` berarti "pernah ada log ping", bukan "monitoring aktif". Setelah monitoring dimatikan, nilainya tetap `true`. Sumber kebenarannya seharusnya `monitoring_config.enabled`.

**C2. Sidebar tidak diperbarui secara live.** *(Sedang, kode)*
- `DeviceSidebar` memanggil `api.getDevice` dan `api.getDevicePingLogs` sekali saat dibuka. Polling di `MapShell` hanya memperbarui `devices[].status` untuk marker. Akibatnya status, latency, dan "cek terakhir" di sidebar basi selama sidebar terbuka. Ini melanggar build plan 3.2: "Sidebar menampilkan status, latency, waktu cek terakhir".

### D. Konsistensi dokumen, konfigurasi, dan migrasi

**D1. File migrasi yatim yang bertentangan dengan keputusan #6.** *(Sedang)*
- `apps/api/src/db/migrations/0003_update_notifications_per_user.sql` mendesain notifikasi **per user** (`user_id`, `read_at`). Ini bertentangan dengan keputusan #6 (global, `is_read`) dan dengan `schema.ts` yang aktif.
- File ini **tidak** ada di `meta/_journal.json`, jadi drizzle-kit tidak akan menjalankannya. Risikonya: seseorang menjalankannya manual dan merusak skema. Usulan: hapus (lihat Q7).
- Journal yang benar hanya mencatat `0003_exotic_spiral`, yang sudah sesuai `schema.ts`.

**D2. `PING_CONCURRENCY` tidak ada di `.env.example`.** *(Rendah, pelanggaran AGENTS.md aturan 5)*
- `env.ts` memakai `PING_CONCURRENCY` dengan default 10, tetapi tidak didokumentasikan di `.env.example`.

**D3. Konflik: rate limit login/TOTP.** *(Perlu keputusan Anda, AGENTS.md aturan 4 dan 9)*
- Build plan 3.5 meminta "Rate limit pada endpoint login/TOTP".
- Flow bagian Keamanan menyatakan "Tidak ada rate limit HTTP global di v1 (lock 2FA sudah cukup)".
- Kedua dokumen bertentangan. Sesuai aturan kerja, saya tidak akan memilih sendiri (lihat Q4).

**D4. Route `:id` tidak divalidasi sebagai UUID.** *(Rendah)*
- `GET /notifications/abc/read`, `GET /devices/abc/monitoring`, dll. akan diteruskan ke PostgreSQL dan menghasilkan error 500, bukan 400/404.

**D5. README dan AGENTS.md tertinggal dari kondisi kode.** *(Rendah)*
- `AGENTS.md` masih menulis "Fase aktif: Fase 1... Belum ada kode".
- README bagian Fase 2 masih menulis "Mesin ping belum berjalan di Fase 2" dan belum mencantumkan endpoint notifikasi, monitoring, dan search.

### E. Yang sudah benar (supaya tidak ikut diubah)

- Skema `notifications` global dengan `is_read` dan indeks yang sesuai keputusan #6.
- Validasi IP di saat simpan (`lib/device-rules.ts`) dan `spawn` tanpa shell dengan argumen array.
- Clustering terpasang (`react-leaflet-cluster` di `MapView.tsx`), dan toggle disimpan di `localStorage`.
- Filter AND di `filteredDevices` sudah benar.
- Notifikasi memakai `isRead` dan tombol "Tandai semua dibaca" tersedia.
- Klik notifikasi melakukan fly-to dan membuka sidebar dengan benar (`handleNotificationClick`).
- Polling berhenti saat tab tidak aktif (`visibilitychange`), sesuai build plan 3.2.
- Dockerfile API sudah memasang `iputils-ping`.

---

## 4. Cara Memastikan Fitur Ping Benar-benar Bekerja

Jalankan langkah ini di server Anda (VPS), bukan di sandbox. Hasilnya bisa Anda cocokkan dengan ekspektasi di setiap langkah.

### 4.1 Binary ping ada di container dan bisa mengirim ICMP

```bash
docker compose exec api sh -c 'which ping && ping -c 1 -W 2 127.0.0.1'
```
Ekspektasi: path `ping` tercetak, lalu `1 packets transmitted, 1 received`, exit 0.

### 4.2 Container bisa menjangkau perangkat target

```bash
# Dari host VPS
ping -c 1 -W 2 <IP_PERANGKAT>
# Dari dalam container API
docker compose exec api ping -c 1 -W 2 <IP_PERANGKAT>
```
Jika host berhasil tetapi container gagal, masalahnya ada di routing atau NAT jaringan Docker (bukan kode aplikasi). Solusi yang umum adalah `network_mode: host` untuk service `api`, dengan konsekuensi port mapping berubah. Ini perlu diputuskan bersama Anda sebelum diubah.

### 4.3 Scheduler berjalan dan tidak menumpuk

```bash
docker compose logs -f api | grep -i "monitoring\|Ping failed"
```
Ekspektasi: baris `Starting monitoring scheduler (tick every 5s)` muncul sekali saat start. Tidak boleh ada error berulang untuk device yang sama.

Cek jumlah ping per device dalam satu menit (untuk interval 60 dtk, setiap device seharusnya tepat 1 log per menit):

```bash
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
"SELECT device_id, count(*) AS cek_1_menit
   FROM ping_logs
  WHERE checked_at > now() - interval '1 minute'
  GROUP BY device_id
  ORDER BY cek_1_menit DESC
  LIMIT 10;"
```
Ekspektasi untuk interval 60 dtk: nilai `cek_1_menit` maksimal 1. Nilai 2 atau lebih menandakan bug B1.

### 4.4 Lonceng kanan atas bisa diklik (verifikasi A2)

Buka DevTools di browser, pilih tombol lonceng kanan atas, lalu di tab Computed cari `pointer-events`. Jika nilainya `none`, konfirmasi A2. Atau jalankan di Console:

```js
getComputedStyle(document.querySelector('.overlay-top-right button')).pointerEvents
```
Ekspektasi yang benar: `auto`.

### 4.5 Latency masuk akal

```bash
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
"SELECT d.name, p.is_up, p.latency_ms, p.checked_at
   FROM ping_logs p JOIN devices d ON d.id = p.device_id
  ORDER BY p.checked_at DESC LIMIT 20;"
```
Bandingkan `latency_ms` dengan `time=... ms` dari `ping` manual ke IP yang sama. Jika selisih konsisten lebih dari beberapa milidetik, itu B3.

### 4.6 Notifikasi tidak palsu

```bash
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
"SELECT message, is_up, created_at FROM notifications ORDER BY created_at DESC LIMIT 20;"
```
Jika Anda melihat "X kembali online" untuk device yang sebelumnya tidak pernah offline, itu A4.

### 4.7 Skenario uji fungsional end-to-end

Gunakan satu device dengan IP `127.0.0.1` (up) dan interval 5 dtk.

1. Aktifkan monitoring. Dalam ≤ 10 dtk, marker berwarna hijau.
2. Ubah IP menjadi `192.0.2.1` (TEST-NET, tidak terjangkau). Dalam ≤ interval + tick + timeout, marker merah dan muncul notifikasi "offline".
3. Ubah IP kembali ke `127.0.0.1`. Muncul notifikasi "kembali online".
4. Klik notifikasi. Peta harus fly-to dan sidebar terbuka untuk device yang benar.
5. Matikan monitoring. Marker harus abu-abu (setelah perbaikan B6).
6. Klik marker: sidebar menampilkan latency dan "cek terakhir" yang berubah tanpa reload (setelah perbaikan C2).

### 4.8 Uji beban (persyaratan build plan 3.1)

Seed 100 device dengan IP unreachable (`192.0.2.x`), interval 60 dtk. Pantau jumlah proses ping yang berjalan bersamaan:

```bash
docker compose top api
```
Ekspektasi: nilai tidak pernah melebihi `PING_CONCURRENCY`. Versi sekarang berpotensi melampaui batas (B1).

Catatan: image API tidak selalu memuat `ps` atau `watch`. Jika perintah di atas gagal, jalankan dari host: `docker compose top api` (menampilkan proses di dalam container) lalu hitung baris yang berisi `ping -c`.

---

## 5. Pertanyaan untuk Anda (Keputusan yang Belum Diambil)

Sesuai `AGENTS.md`, saya tidak memutuskan hal-hal ini sendiri. Rekomendasi saya ada di tiap pertanyaan.

**Q1. Tombol "Notifikasi" di toolbar bawah.** Hapus (rekomendasi, sesuai flow #3 dan build plan "lonceng kanan atas"), atau pertahankan dan buka dropdown dari toolbar juga?

**Q2. Bentrok sidebar dengan lonceng.** Geser sidebar dan filter panel ke bawah lonceng (rekomendasi, sesuai flow section 10 "lonceng tetap terlihat"), atau sembunyikan lonceng saat sidebar terbuka?

**Q3. Threshold offline.** Berapa kegagalan berturut-turut sebelum status menjadi `offline`? Rekomendasi: 2 (env `PING_FAIL_THRESHOLD`). Ini butuh kolom baru dan migrasi. Jika tidak diperlukan, jawab "tidak" dan B5 ditunda.

**Q4. Rate limit login/TOTP.** Build plan 3.5 meminta rate limit, sedangkan flow menyatakan tidak ada rate limit global di v1. Pilih salah satu:
- (a) Ikuti flow: hanya lock 2FA yang sudah ada (tidak ada perubahan).
- (b) Ikuti build plan: tambahkan rate limit per IP pada login dan TOTP.
Rekomendasi saya: (b) untuk login dan TOTP saja, karena lock 2FA hanya melindungi akun, bukan endpoint login dari brute-force lintas akun.

**Q5. Waktu retensi `ping_logs`.** Tiap tick (teks keputusan #7) atau tiap jam (implementasi sekarang)? Rekomendasi: tiap jam, lalu ubah teks di README.

**Q6. Status saat monitoring dimatikan.** Kembali ke `unmonitored` (abu-abu)? Rekomendasi: ya (B6).

**Q7. File migrasi yatim.** Hapus `0003_update_notifications_per_user.sql`? Rekomendasi: ya, karena bertentangan dengan keputusan #6 dan tidak ada di journal.

---

## 6. Rencana Perbaikan dalam 3 Fase

Urutan dipilih berdasarkan dampak ke keluhan Anda dan risiko. Fase 1 paling cepat terlihat dan paling kecil risikonya. Fase 2 menjawab "apakah ping benar-benar bekerja". Fase 3 menutup keamanan dan konsistensi.

> **Catatan format:** cuplikan `diff` di bawah adalah panduan perubahan, bukan patch yang bisa langsung di-`git apply`. Beberapa blok sengaja dipersingkat dengan `...`. Implementasi dilakukan per langkah dan setiap langkah diperiksa dengan cek di bawahnya.

Setiap fase diakhiri dengan Definition of Done dan laporan. Saya berhenti dan menunggu persetujuan Anda sebelum fase berikutnya.

---

### FASE 1 — Perbaiki UI Notifikasi dan Pojok Kanan Atas

**Tujuan:** keluhan dropdown dan duplikasi selesai, tanpa menyentuh logika ping.

**Prasyarat:** jawaban Q1 dan Q2. Jika Anda sudah kirim screenshot pojok kanan atas, kita pastikan elemen mana yang dimaksud (A3).

#### Langkah 1.1 — Hapus tombol Notifikasi dari toolbar (A1)

Rekomendasi (Q1 = hapus):

```diff
--- a/apps/web/src/components/Toolbar.tsx
+++ b/apps/web/src/components/Toolbar.tsx
@@
 import {
-  Bell,
   Cable,
   ChevronUp,
   Hand,
   Layers,
   MousePointer2,
   Router,
   Search,
   type LucideIcon,
 } from "lucide-react";

 export type ToolId =
   | "select"
   | "pan"
   | "add-device"
   | "add-cable"
   | "search"
   | "clustering"
-  | "notifications"
   | "more";

 const TOOLS: Tool[] = [
   { id: "select", label: "Select", icon: MousePointer2 },
   { id: "pan", label: "Pan", icon: Hand },
   { id: "add-device", label: "+ Perangkat", icon: Router },
   { id: "add-cable", label: "+ Kabel", icon: Cable },
   { id: "search", label: "Search", icon: Search },
   { id: "clustering", label: "Clustering", icon: Layers },
-  { id: "notifications", label: "Notifikasi", icon: Bell },
 ];
```

Efek: toolbar kembali ke 7 tool sesuai flow #3, dan efek samping `selectEnabled = false` tidak terjadi lagi.

Jika Anda memilih mempertahankan (Q1 = dropdown dari toolbar), state `open` harus dinaikkan ke `MapShell` dan dikirim ke `NotificationBell` sebagai prop terkontrol. Ini dikerjakan di langkah yang sama, tetapi tetap perlu persetujuan Anda dulu.

#### Langkah 1.2 — Aktifkan klik pada lonceng kanan atas (A2)

```diff
--- a/apps/web/src/styles.css
+++ b/apps/web/src/styles.css
@@
 .overlay-top-right {
   position: absolute;
   top: 16px;
   right: 16px;
   z-index: 25;
+  pointer-events: auto;
 }
```

#### Langkah 1.3 — Geser sidebar dan filter ke bawah lonceng (A3, Q2 = geser)

Lonceng berukuran 40 px (`--size-toolbar-button`) dengan jarak 16 px dari atas, jadi area bawahnya dimulai di 56 px. Beri jarak 16 px lagi:

```diff
--- a/apps/web/src/styles.css
+++ b/apps/web/src/styles.css
@@
 .filter-panel {
   position: absolute;
-  top: 16px;
+  top: 72px;
   right: 16px;
@@
 .device-sidebar {
   position: absolute;
-  top: 16px;
+  top: 72px;
   right: 16px;
   bottom: 16px;
```

Untuk mobile (`@media (max-width: 640px)`), posisi `top: 68px` sudah ada dan lonceng di 12 px + 40 px = 52 px, jadi tidak perlu diubah.

Jika Anda memilih sembunyikan lonceng saat sidebar terbuka (alternatif Q2), ubah `.overlay-top-right` dengan kelas kondisional dari `MapShell`. Ini tidak direkomendasikan karena bertentangan dengan flow section 10.

#### Langkah 1.4 — Pastikan dropdown tidak tertutup dan tetap bisa dipakai

- `.notification-dropdown` memakai `position:absolute; right:0; top: calc(100% + 8px)`. Setelah langkah 1.2 dan 1.3, dropdown harus diuji agar tidak tertutup sidebar (z-index dropdown = 30, sidebar = 24, sudah cukup).
- Tes manual: buka lonceng dengan sidebar terbuka, lalu klik item notifikasi.

#### Cek Fase 1

- [ ] Toolbar bawah berisi 7 tool sesuai flow #3. Tidak ada tombol Notifikasi.
- [ ] Klik lonceng kanan atas membuka dropdown (`pointer-events` = `auto` di DevTools).
- [ ] Dengan sidebar terbuka, lonceng dan tombol tutup sidebar tidak bertumpuk.
- [ ] Dropdown notifikasi tampil di atas peta dan sidebar, dengan daftar, badge, dan "Tandai semua dibaca".
- [ ] Klik item notifikasi: peta fly-to dan sidebar perangkat yang benar terbuka.
- [ ] Layout desktop dan mobile (≤ 640 px) tidak rusak. Peta tetap bisa di-drag dan di-zoom di area kosong.
- [ ] `bun run typecheck` lolos.

#### Definition of Done — Fase 1

- [ ] Seluruh cek Fase 1 tercentang.
- [ ] Screenshot sebelum dan sesudah pojok kanan atas dilampirkan untuk konfirmasi Anda.
- [ ] Laporan ke Anda (format di `build-plan-3-fase.md`). **Berhenti, tunggu persetujuan.**

---

### FASE 2 — Mesin Ping yang Andal dan Status Real-time

**Tujuan:** ping bekerja sesuai interval tanpa tumpang tindih, latency akurat, status real-time aman dan ringan, dan Anda bisa memverifikasi hasilnya dengan bagian 4.

**Prasyarat:** jawaban Q3 (threshold), Q5 (retensi), Q6 (status saat dimatikan).

#### Langkah 2.1 — Scheduler: klaim, guard, dan pembaruan yang selalu terjadi (B1, B2)

```diff
--- a/apps/api/src/services/monitor.ts
+++ b/apps/api/src/services/monitor.ts
@@
+import { isValidIpAddress } from "../lib/ip-validation.ts";
+
+let tickRunning = false;
+
 async function pingDevice(target: PingTarget): Promise<void> {
+  // Klaim dulu: dorong next_check_at ke masa depan sebelum ping.
+  // Tick berikutnya tidak akan mengambil device ini lagi selama ping berjalan.
+  try {
+    await db
+      .update(monitoringConfig)
+      .set({ nextCheckAt: new Date(Date.now() + target.intervalSeconds * 1000) })
+      .where(eq(monitoringConfig.deviceId, target.deviceId));
+  } catch (error) {
+    console.error(`Gagal mengklaim device ${target.deviceId}:`, error);
+    return;
+  }
+
   const startTime = Date.now();
   try {
     ...
-    // Update next_check_at
-    await db.update(monitoringConfig)...
   } catch (error) {
     console.error(`Ping failed for device ${target.deviceId}:`, error);
   }
 }

 async function tick(): Promise<void> {
+  // Guard: jangan jalankan tick baru selama tick sebelumnya masih berjalan.
+  if (tickRunning) return;
+  tickRunning = true;
   try {
     ...
-  } catch (error) {
-    console.error("Tick error:", error);
-  }
+  } catch (error) {
+    console.error("Tick error:", error);
+  } finally {
+    tickRunning = false;
+  }
 }
```

Catatan: `tickRunning` sudah cukup karena klaim `next_check_at` menjamin device yang sudah diambil tidak diambil lagi. Dengan begitu proses `ping` yang berjalan bersamaan tidak melampaui batas per tick. Untuk batas global yang ketat, tambahkan semaphore sederhana di level modul (mis. antrean dengan `PING_CONCURRENCY` slot). Ini bagian dari langkah yang sama.

Versi simulasi usulan (`tick-sim2.mjs`) memakai pola yang sama dan menghasilkan 100 ping, puncak 10, dan 0 duplikasi.

#### Langkah 2.2 — Latency dari output ping dan validasi IP sebelum spawn (B3, B4)

```diff
--- a/apps/api/src/services/monitor.ts
+++ b/apps/api/src/services/monitor.ts
@@
-function executePing(ipAddress: string, timeoutMs: number): Promise<{ success: boolean }> {
+function executePing(
+  ipAddress: string,
+  timeoutMs: number,
+): Promise<{ success: boolean; latencyMs: number | null }> {
   return new Promise((resolve) => {
-    const child = spawn("ping", ["-c", "1", "-W", String(Math.ceil(timeoutMs / 1000)), ipAddress]);
-    let resolved = false;
-    const timeout = setTimeout(() => { ... }, timeoutMs);
-    child.on("close", (code) => { ... });
-    child.on("error", () => { ... });
+    const deadlineSec = String(Math.max(1, Math.ceil(timeoutMs / 1000)));
+    // "--" memisahkan opsi dari target: IP tidak pernah diperlakukan sebagai opsi.
+    const child = spawn("ping", ["-c", "1", "-W", deadlineSec, "--", ipAddress], {
+      stdio: ["ignore", "pipe", "ignore"],
+    });
+    let stdout = "";
+    let settled = false;
+    let timer: ReturnType<typeof setTimeout> | undefined;
+
+    const finish = (value: { success: boolean; latencyMs: number | null }) => {
+      if (settled) return;
+      settled = true;
+      if (timer) clearTimeout(timer);
+      resolve(value);
+    };
+
+    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
+
+    // Batas JS sedikit lebih longgar dari -W agar balasan di detik terakhir tidak terpotong.
+    timer = setTimeout(() => {
+      child.kill("SIGKILL");
+      finish({ success: false, latencyMs: null });
+    }, timeoutMs + 500);
+
+    child.on("close", (code) => {
+      const match = stdout.match(/time=([\d.]+)\s*ms/);
+      const success = code === 0;
+      finish({
+        success,
+        latencyMs: success && match ? Math.round(Number(match[1])) : null,
+      });
+    });
+    child.on("error", () => finish({ success: false, latencyMs: null }));
   });
 }
```

Validasi ulang di `pingDevice` (sebelum `executePing`):

```ts
if (!target.ipAddress || !isValidIpAddress(target.ipAddress)) {
  console.error(`IP tidak valid untuk device ${target.deviceId}, pengecekan dilewati.`);
  return;
}
```

Catatan: `ping -W` pada iputils berarti batas tunggu balasan dalam detik. Pada `ping` Alpine/BusyBox, opsinya berbeda. Image Dockerfile saat ini memakai Debian (`oven/bun:1.4.4-debian`) dan `iputils-ping`, jadi aman.

Perbaiki pemakaian `pingDevice` agar memakai `latencyMs` dari `executePing`:

```diff
-    const result = await executePing(target.ipAddress, env.PING_TIMEOUT_MS);
-    const latency = result.success ? Date.now() - startTime : null;
+    const result = await executePing(target.ipAddress, env.PING_TIMEOUT_MS);
+    const latency = result.latencyMs;
```

#### Langkah 2.3 — Notifikasi hanya untuk perubahan nyata (A4)

Pisahkan keputusan notifikasi ke fungsi murni agar bisa diuji:

```ts
// lib/monitor-rules.ts
export type DeviceStatus = "active" | "offline" | "unmonitored";

export function shouldNotify(previous: DeviceStatus, next: DeviceStatus): boolean {
  if (previous === next) return false;
  // Pengecekan pertama yang berhasil bukan "kembali online" karena device belum pernah diketahui offline.
  if (previous === "unmonitored" && next === "active") return false;
  return true; // offline pertama kali tetap diberitahu; active<->offline selalu diberitahu.
}
```

Di `pingDevice`, status tetap diperbarui walau notifikasi tidak dibuat.

#### Langkah 2.4 — Matikan monitoring mengembalikan status (B6, Q6 = ya)

```diff
--- a/apps/api/src/routes/monitoring.ts
+++ b/apps/api/src/routes/monitoring.ts
@@
       const [updated] = await db
         .update(monitoringConfig)
         ...
         .returning();
+
+      if (!data.enabled) {
+        await db.update(devices).set({ status: "unmonitored" }).where(eq(devices.id, id));
+      }
```

Lakukan dalam transaksi yang sama jika memungkinkan (`db.transaction`).

#### Langkah 2.5 — Endpoint status real-time yang ringkas dan aman (C1)

Pindahkan dari `/health/status` ke `GET /monitoring/status`, dilindungi `requireAuth` dan `requirePermission("monitoring", "read")`. Satu query dengan `LATERAL` menggantikan N+1:

```sql
SELECT d.id,
       d.status,
       COALESCE(mc.enabled, false) AS monitoring_enabled,
       pl.is_up,
       pl.latency_ms,
       pl.checked_at
  FROM devices d
  LEFT JOIN monitoring_config mc ON mc.device_id = d.id
  LEFT JOIN LATERAL (
    SELECT p.is_up, p.latency_ms, p.checked_at
      FROM ping_logs p
     WHERE p.device_id = d.id
     ORDER BY p.checked_at DESC
     LIMIT 1
  ) pl ON true;
```

Di Drizzle, gunakan `db.execute(sql\`...\`)` atau query builder dengan `sql` untuk bagian `LATERAL`. Bentuk respons tetap sama seperti sekarang agar frontend tidak banyak berubah, dengan `monitoringEnabled` dari `monitoring_config.enabled`.

Frontend (`api.ts`): ganti `"/health/status"` menjadi `"/monitoring/status"`. Setelah itu, `/health` kembali hanya untuk cek DB.

Jika ingin transisi aman, biarkan `/health/status` sementara dengan `requireAuth` dan tandai deprecated di README, lalu hapus di Fase 3.

#### Langkah 2.6 — Sidebar ikut live (C2)

Di `DeviceSidebar`, tambahkan efek polling ringan yang hanya memuat ulang status dan ping terakhir untuk device yang sedang dibuka (mis. setiap `VITE_STATUS_POLL_INTERVAL_MS`), dengan pola yang sama seperti `MapShell` (berhenti saat tab tidak aktif).

Hindari memuat ulang seluruh form atau deskripsi, supaya tidak menimpa edit yang sedang diketik user.

#### Langkah 2.7 — Konfigurasi dan dokumentasi env (D2)

```diff
--- a/.env.example
+++ b/.env.example
@@
 PING_TICK_SECONDS=5
 PING_TIMEOUT_MS=2000
+PING_CONCURRENCY=10
 PING_LOG_RETENTION_DAYS=30
```

#### Langkah 2.8 — Pengujian otomatis

Tambahkan `apps/api/src/services/monitor-rules.test.ts` (pola sama dengan test yang sudah ada di `lib/*.test.ts`):

```ts
import { describe, expect, test } from "bun:test";
import { shouldNotify } from "../lib/monitor-rules.ts";
import { parsePingLatency } from "../lib/monitor-rules.ts";

describe("shouldNotify", () => {
  test("pengecekan pertama yang berhasil tidak membuat notifikasi", () => {
    expect(shouldNotify("unmonitored", "active")).toBe(false);
  });
  test("active ke offline selalu memberi notifikasi", () => {
    expect(shouldNotify("active", "offline")).toBe(true);
  });
  test("status tidak berubah tidak memberi notifikasi", () => {
    expect(shouldNotify("offline", "offline")).toBe(false);
  });
});

describe("parsePingLatency", () => {
  test("membaca time= dari output ping", () => {
    const out = "64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=0.052 ms";
    expect(parsePingLatency(out)).toBe(0);
  });
  test("mengembalikan null bila tidak ada time=", () => {
    expect(parsePingLatency("100% packet loss")).toBeNull();
  });
});
```

Catatan: `parsePingLatency` perlu diekspor dari `lib/monitor-rules.ts` (fungsi kecil yang dipakai `executePing`).

#### Cek Fase 2

- [ ] Uji beban 100 device (bagian 4.8): proses `ping` bersamaan tidak melampaui `PING_CONCURRENCY`.
- [ ] Bagian 4.3: tidak ada device dengan lebih dari satu log per interval.
- [ ] Bagian 4.5: `latency_ms` sesuai `time=` dari `ping` manual.
- [ ] Bagian 4.6: tidak ada notifikasi "kembali online" palsu saat pengecekan pertama.
- [ ] Skenario 4.7 lengkap: up → offline → up, marker merah dan notifikasi muncul dalam satu siklus polling.
- [ ] Mematikan monitoring membuat marker abu-abu dan status `unmonitored`.
- [ ] `GET /monitoring/status` memerlukan sesi (401 tanpa sesi), memerlukan `monitoring:read` (403 tanpa izin), dan hanya satu query di log SQL.
- [ ] Sidebar memperbarui status dan latency tanpa reload.
- [ ] `bun run --cwd apps/api test` lolos, termasuk `monitor-rules.test.ts`.

#### Definition of Done — Fase 2

- [ ] Seluruh cek Fase 2 tercentang.
- [ ] Hasil bagian 4 (dengan output nyata dari server Anda) dilampirkan.
- [ ] Laporan ke Anda. **Berhenti, tunggu persetujuan.**

---

### FASE 3 — Keamanan, Permission, dan Konsistensi

**Tujuan:** semua endpoint sesuai matriks permission, tidak ada celah akses, dokumen dan konfigurasi sinkron, dan tidak ada sisa file yang membingungkan.

**Prasyarat:** jawaban Q4 (rate limit), Q7 (hapus migrasi yatim).

#### Langkah 3.1 — Permission sesuai matriks (B7, A5)

```diff
--- a/apps/api/src/routes/monitoring.ts
+++ b/apps/api/src/routes/monitoring.ts
@@
-monitoringRoutes.get("/devices/:id/monitoring", async (c) => {
+monitoringRoutes.get("/devices/:id/monitoring", requirePermission("monitoring", "read"), async (c) => {
@@
-  requirePermission("devices", "write"),
+  requirePermission("monitoring", "write"),
@@
-monitoringRoutes.get("/devices/:id/ping-logs", async (c) => {
+monitoringRoutes.get("/devices/:id/ping-logs", requirePermission("monitoring", "read"), async (c) => {
```

```diff
--- a/apps/api/src/routes/notifications.ts
+++ b/apps/api/src/routes/notifications.ts
@@
-notificationRoutes.get("/", async (c) => {
+notificationRoutes.get("/", requirePermission("notifications", "read"), async (c) => {
@@
-notificationRoutes.get("/unread-count", async (c) => {
+notificationRoutes.get("/unread-count", requirePermission("notifications", "read"), async (c) => {
@@
-notificationRoutes.post("/:id/read", async (c) => {
+notificationRoutes.post("/:id/read", requirePermission("notifications", "write"), async (c) => {
@@
-notificationRoutes.post("/mark-all-read", async (c) => {
+notificationRoutes.post("/mark-all-read", requirePermission("notifications", "write"), async (c) => {
```

Untuk `unread-count`, ganti juga implementasinya:

```ts
const [{ count }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(notifications)
  .where(eq(notifications.isRead, false));
return c.json({ count });
```

```diff
--- a/apps/api/src/routes/search.ts
+++ b/apps/api/src/routes/search.ts
@@
+import { requirePermission } from "../middleware/permission.ts";
@@
-searchRoutes.get("/", async (c) => {
+searchRoutes.get("/", requirePermission("devices", "read"), async (c) => {
```

Catatan: `requirePermission` ditulis setelah `requireAuth` (`use("*")`), sama seperti route devices yang sudah ada.

#### Langkah 3.2 — Validasi UUID pada parameter `:id` (D4)

Tambahkan validator sederhana untuk semua route yang punya `:id`:

```ts
const uuidParam = z.string().uuid();
const parsed = uuidParam.safeParse(c.req.param("id"));
if (!parsed.success) throw new HTTPException(400, { message: "ID tidak valid." });
```

Lebih rapi sebagai middleware kecil di `lib/validation.ts`, lalu dipasang di route monitoring dan notifications.

#### Langkah 3.3 — Hapus file migrasi yatim (D1, Q7 = ya)

```bash
git rm apps/api/src/db/migrations/0003_update_notifications_per_user.sql
```
Pastikan `meta/_journal.json` tidak berubah, lalu jalankan `bun run db:migrate` pada DB kosong untuk memastikan tidak ada yang rusak.

#### Langkah 3.4 — Rate limit login dan TOTP (D3, Q4)

Hanya dikerjakan setelah Anda memilih (a) atau (b) di Q4. Jika (b), gunakan limiter in-memory per IP dan per email untuk `POST /auth/login` dan `POST /auth/2fa/verify`, dengan nilai dari `.env` (tambah ke `.env.example`). Untuk satu VPS ini cukup. Jika nanti ada lebih dari satu instance API, pindahkan ke store bersama.

#### Langkah 3.5 — Dokumen dan README sinkron (D5)

- README: tambahkan endpoint Fase 3 (notifikasi, monitoring, status, search) dengan kolom Akses, catat Q5 dan Q6, ubah teks keputusan #7 sesuai hasil Q5, dan hapus kalimat "Mesin ping belum berjalan".
- `AGENTS.md`: perbarui bagian "Status proyek saat ini" ke kondisi nyata setelah Fase 3.
- Hapus `/health/status` lama jika transisi di Fase 2 memakai periode deprecated.

#### Cek Fase 3

- [ ] Role tanpa `monitoring:read` mendapat 403 di `GET /devices/:id/monitoring`.
- [ ] Viewer mendapat 403 di `POST /notifications/:id/read` dan `mark-all-read`.
- [ ] `GET /search` mendapat 403 tanpa `devices:read`.
- [ ] `GET /devices/abc/monitoring` mendapat 400 (bukan 500).
- [ ] `unread-count` memakai `COUNT(*)` (cek di log SQL).
- [ ] `git grep -n "password\|secret\|TOKEN"` pada pola umum tidak menemukan kredensial.
- [ ] Migrasi dari DB kosong tanpa error dan seed tetap idempoten.
- [ ] `PING_CONCURRENCY` ada di `.env.example`.
- [ ] Rate limit (bila Q4 = b) menolak percobaan berlebih dengan 429 dan pesan yang jelas.

#### Definition of Done — Fase 3 (dan Fase 3 secara keseluruhan)

- [ ] Seluruh cek Fase 3 tercentang.
- [ ] Skenario end-to-end penuh (flow #12): login + 2FA → katalog → perangkat → kabel → enable monitoring → perangkat dimatikan → marker merah + notifikasi → klik notifikasi menuju perangkat.
- [ ] Layout sesuai spesifikasi: logo kiri atas, lonceng kanan atas (dapat diklik, tidak bertumpuk), toolbar tengah bawah dengan 7 tool, peta penuh layar.
- [ ] Laporan akhir ke Anda sesuai format di `build-plan-3-fase.md`.

---

## 7. Urutan Eksekusi yang Disarankan

1. Jawab Q1 sampai Q7 (rekomendasi saya bisa langsung Anda setujui).
2. Kirim screenshot pojok kanan atas (untuk A3) dan hasil cek A2 di DevTools.
3. Fase 1 dikerjakan dan Anda uji. Setelah lolos, lanjut ke Fase 2.
4. Fase 2 dikerjakan, lalu Anda jalankan bagian 4 di server dan kirim outputnya. Ini jawaban langsung untuk "apakah ping benar-benar bekerja".
5. Fase 3 dikerjakan setelah Fase 2 disetujui.

---

## 8. Lampiran: Verifikasi yang Dilakukan di Sandbox

- Simulasi scheduler (model waktu dipercepat): versi asli menghasilkan 280 ping, puncak 50, 80 device ganda; versi usulan menghasilkan 100 ping, puncak 10, 0 ganda.
- Pemeriksaan kode: CSS `pointer-events` (`.ui-overlay` → `.overlay-top-right` tanpa `auto`), `handleToolSelect` (tidak menangani `notifications`), route tanpa `requirePermission` (notifications, monitoring GET, ping-logs, search), `/health` tanpa auth, `.env.example` tanpa `PING_CONCURRENCY`, migrasi yatim di luar journal.
- Tidak dijalankan di sandbox: `ping` ICMP sungguhan (binary tidak tersedia), PostgreSQL, Docker, dan browser. Semua hal ini harus diverifikasi lewat bagian 4.

---

## 9. Revisi Berdasarkan Keputusan User (Q1 dan Q7)

### Keputusan Q1 — Notifikasi hanya di toolbar bawah

Keputusan user: lonceng dipindah sepenuhnya ke toolbar bawah. Lonceng di pojok kanan atas dihapus, sehingga hanya ada satu pintu masuk notifikasi. Dropdown yang sekarang muncul di bawah lonceng kanan atas menutupi sidebar. Dengan pindah ke toolbar bawah, dropdown dibuka ke atas dari toolbar dan tidak lagi bertabrakan dengan sidebar yang berada di kanan.

Revisi Fase 1:

1. **Hapus lonceng kanan atas.** Hapus `<div className="overlay-top-right">` beserta `NotificationBell` dari `MapShell.tsx`. Hapus juga aturan CSS `.overlay-top-right`. Langkah 1.2 (`pointer-events`) dan 1.3 (geser sidebar ke `top: 72px`) menjadi tidak perlu lagi.
2. **Tombol notifikasi di toolbar.** Pertahankan id `"notifications"` dan ikon `Bell` di toolbar, lalu tambahkan badge jumlah belum dibaca di tombol itu. Badge memakai data polling `unread-count` yang sudah ada di `NotificationBell`.
3. **State dropdown dinaikkan ke MapShell.** Ganti `NotificationBell` menjadi komponen terkontrol: `open` dan `setOpen` dikirim dari `MapShell`. Klik tombol toolbar `notifications` membuka atau menutup dropdown. Tombol itu tidak mengubah `activeTool`, sehingga mode Select tidak ikut mati.
4. **Posisi dropdown.** Dropdown muncul di atas toolbar, rata tengah bawah, misalnya `bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); width: 360px; max-height: 60vh`. Di desktop area ini tidak bertabrakan dengan sidebar di kanan. Di layar kecil (≤ 640 px) sidebar memenuhi lebar layar, jadi saat dropdown dibuka sidebar ditutup dulu. Ini perlu Anda konfirmasi.
5. **Klik item notifikasi.** Peta fly-to, sidebar perangkat terbuka, dan dropdown ditutup. Notifikasi ditandai sudah dibaca.
6. **Tutup dropdown** dengan klik di luar, tombol Escape, atau klik tombol toolbar lagi.

Catatan tambahan dari screenshot: badge di lonceng kanan atas menunjukkan **63 notifikasi belum dibaca**. Jumlah sebesar ini kemungkinan besar berasal dari bug A4 (notifikasi "kembali online" palsu pada pengecekan pertama untuk device yang belum pernah offline). Anda bisa memastikannya dengan query berikut dan melihat apakah pesan yang muncul adalah "kembali online":

```bash
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
"SELECT message, is_up, created_at FROM notifications WHERE is_read = false ORDER BY created_at LIMIT 70;"
```

Bila benar, perbaikan A4 (Fase 2) sebaiknya dikerjakan bersamaan dengan pembersihan notifikasi lama. Pembersihan itu butuh persetujuan Anda karena menghapus data.

Cek Fase 1 yang diperbarui:
- [ ] Tidak ada lonceng di pojok kanan atas.
- [ ] Toolbar bawah berisi 7 tool dan tombol notifikasi dengan badge jumlah belum dibaca.
- [ ] Dropdown terbuka di atas toolbar, dan sidebar perangkat tetap terlihat saat dropdown dibuka (desktop).
- [ ] Mode Select tidak mati setelah tombol notifikasi diklik.
- [ ] Klik item: peta fly-to, sidebar perangkat yang benar terbuka, dropdown tertutup.

### Penjelasan Q7 — File migrasi `0003_update_notifications_per_user.sql`

**Apa isinya.** Ini draf migrasi dari desain yang berbeda. Desainnya membuat status baca **per user**: kolom `user_id` ditambahkan dan wajib diisi, `is_read` diganti `read_at`, lalu `is_read` dihapus.

**Kenapa tidak berlaku.** Aplikasi tidak memakai file ini:
- `meta/_journal.json` (daftar migrasi resmi) hanya mencatat empat migrasi: `0000` sampai `0003_exotic_spiral`. File ini tidak ada di sana. Drizzle membaca journal, bukan folder, sehingga file ini tidak pernah dijalankan oleh `bun run db:migrate`.
- Tidak ada satu pun file lain di repo yang merujuknya (sudah saya cek).
- Kode aplikasi dan `schema.ts` memakai model **global** (`is_read`), sesuai keputusan #6.

**Kenapa sebaiknya dihapus.**
1. **Membingungkan.** Ada dua file bernama `0003`. Siapa pun yang membaca folder migrasi bisa mengira ini bagian dari sejarah skema yang sah.
2. **Berbahaya bila dijalankan manual.** Jika seseorang menjalankannya lewat `psql`, kolom `is_read` hilang dan `user_id` menjadi wajib. Akibatnya kode notifikasi yang sekarang langsung error (500) di semua endpoint notifikasi.
3. **Bertentangan dengan keputusan #6.** Keputusan yang tercatat di README adalah notifikasi global. Draf ini adalah desain yang sudah ditinggalkan.

**Risiko menghapus.** Kecil. Tidak ada yang merujuknya, dan Git tetap menyimpan riwayatnya kalau suatu saat dibutuhkan. Alternatifnya, file bisa dipindah ke folder `docs/arsip/` dengan nama yang jelas agar tidak ada di folder migrasi. Saya tidak merekomendasikan opsi ini karena tidak ada alasan menyimpannya.

**Perintah yang akan dijalankan (Fase 3, langkah 3.3):**

```bash
git rm apps/api/src/db/migrations/0003_update_notifications_per_user.sql
bun run db:migrate   # pada database kosong, untuk memastikan tidak ada yang rusak
```

Jawaban Anda untuk Q7 = hapus sudah saya catat. Eksekusinya tetap di Fase 3 sesuai urutan.
