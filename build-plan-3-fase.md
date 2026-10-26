# Build Plan — Network Device Mapping & Monitoring (3 Fase)

Dokumen ini untuk **agent coding**. Baca seluruhnya sebelum menulis kode. Sumber kebenaran fungsional adalah `flow-aplikasi-network-mapping.md` (v2), sumber kebenaran visual adalah `style-guide.md`. Dokumen ini hanya mengatur **urutan kerja, batasan, dan pengecekan**.

---

## 0. Aturan Kerja (berlaku di semua fase)

1. **Ikuti flow.** Jangan menambah fitur di luar `flow-aplikasi-network-mapping.md`. Jika menemukan celah atau ambigu, berhenti dan tanya user.
2. **Kerjakan berurutan.** Selesaikan satu langkah, jalankan pengecekannya, baru lanjut. Jangan lompat ke fase berikutnya.
3. **Gerbang fase.** Di akhir tiap fase, jalankan seluruh checklist "Definition of Done" fase itu, laporkan hasilnya ke user, lalu **berhenti dan tunggu persetujuan** sebelum mulai fase berikutnya.
4. **Jangan putuskan sendiri hal yang belum diputuskan** (lihat Bagian 2). Tanyakan ke user pada fase yang disebutkan.
5. **Tidak ada hardcode.** Semua kredensial dan konfigurasi lewat `.env`. Sediakan `.env.example`.
6. **Tidak ada** reverse proxy, CI/CD, atau fitur opsional (Mikrotik API, SNMP) di v1.
7. **Commit kecil dan sering**, satu commit per langkah bila memungkinkan, dengan pesan jelas.
8. Jika sebuah pengecekan gagal: perbaiki dulu, jangan lanjut. Jika tidak bisa diperbaiki, laporkan ke user dengan pesan error lengkap.

---

## 1. Stack dan Struktur

**Stack:** PostgreSQL + PostGIS, Bun + Hono (API), Drizzle ORM, React + Leaflet (layer satelit ESRI). Deploy lewat Docker Compose; dev langsung pakai Bun.

**Struktur repo yang disarankan:**

```
/
├── apps/
│   ├── api/            # Bun + Hono + Drizzle
│   │   ├── src/
│   │   │   ├── db/         # schema Drizzle, migrasi, seed
│   │   │   ├── routes/     # auth, catalog, devices, cables, monitoring, ...
│   │   │   ├── services/   # logika bisnis, scheduler ping
│   │   │   └── index.ts
│   │   └── Dockerfile      # wajib memuat binary `ping`
│   └── web/            # React + Leaflet
│       └── src/
│           ├── components/ # overlay UI, map, sidebar
│           ├── pages/
│           └── lib/        # api client, state
├── docker-compose.yml
├── .env.example
├── flow-aplikasi-network-mapping.md
└── build-plan-3-fase.md
```

**Variabel `.env` minimum** (tambahkan sesuai kebutuhan, jangan hardcode):

```
DATABASE_URL=
API_PORT=
VITE_API_URL=
SESSION_TTL_HOURS=
UPLOAD_DIR=
MAX_UPLOAD_MB=
PING_TICK_SECONDS=
PING_TIMEOUT_MS=
PING_LOG_RETENTION_DAYS=
```

---

## 2. Keputusan Terbuka (tanyakan ke user, jangan putuskan sendiri)

| # | Keputusan | Tanyakan paling lambat saat |
|---|---|---|
| 1 | Sesi: token di tabel `sessions` (sesuai ERD) atau JWT | Fase 1, langkah 4 |
| 2 | Enkripsi `two_fa_secret` di DB (ya/tidak, pakai kunci apa dari `.env`) | Fase 1, langkah 5 |
| 3 | Backup/recovery codes 2FA (ada/tidak di v1) | Fase 1, langkah 5 |
| 4 | Granularitas permission per role (struktur JSON `permissions`) | Fase 1, langkah 4 |
| 5 | Storage gambar: volume lokal atau MinIO | Fase 2, langkah 7 |
| 6 | Status baca notifikasi: per user atau global | Fase 3, langkah 3 |
| 7 | Kebijakan retensi `ping_logs` (berapa hari) | Fase 3, langkah 1 |

Sebelum langkah terkait, ajukan pertanyaan ke user dengan opsi dan rekomendasi singkat, lalu tunggu jawaban.

---

# FASE 1 — Fondasi: Infrastruktur, Database, Auth, dan Shell UI

**Tujuan:** aplikasi bisa dijalankan, user bisa login (termasuk 2FA per role), dan layar utama berupa peta penuh dengan overlay ala tldraw (belum ada fitur perangkat).

### Langkah 1.1 — Inisialisasi repo dan Docker Compose

- Buat struktur repo (Bagian 1), `docker-compose.yml` dengan service `db` (PostgreSQL + PostGIS) dan `api`. Web boleh jalan lewat `bun run dev` dulu.
- Dockerfile API memasang binary `ping` (mis. paket `iputils-ping`).
- Buat `.env.example` dan `.gitignore` (`.env` tidak boleh ikut commit).

**Cek:**
- [ ] `docker compose up -d db` berjalan, DB bisa dikoneksi.
- [ ] `CREATE EXTENSION postgis;` berhasil (atau aktif lewat migrasi).
- [ ] Di dalam container `api`, perintah `ping -c 1 127.0.0.1` berhasil.

### Langkah 1.2 — Skema database (Drizzle)

- Tulis **seluruh skema** sesuai ERD v2: `roles, users, sessions, device_types, device_models, devices, device_images, cable_types, cables, monitoring_config (+ next_check_at), ping_logs, device_logs, tags, device_tags, notifications`.
- Tambahkan foreign key, indeks pada `(device_id, checked_at)` di `ping_logs`, dan indeks yang wajar untuk pencarian.
- Buat migrasi dan skrip seed: 3 role contoh (Admin dengan `require_2fa = true`, Teknisi, Viewer) dan satu user Admin awal (kredensial dari `.env`/prompt seed, bukan hardcode).

**Cek:**
- [ ] Migrasi berjalan dari DB kosong tanpa error.
- [ ] Semua tabel dan relasi sesuai ERD (periksa dengan `\d` di psql).
- [ ] Seed berjalan dan idempoten (dijalankan dua kali tidak menggandakan data).
- [ ] `bun run typecheck` (atau `tsc --noEmit`) lolos.

### Langkah 1.3 — Kerangka API Hono

- Setup Hono, middleware error handling, logging dasar, CORS dari `.env`, validasi input (mis. zod).
- Endpoint `GET /health`.

**Cek:**
- [ ] `GET /health` mengembalikan 200 dan mengecek koneksi DB.
- [ ] Input tidak valid menghasilkan 400 dengan pesan yang jelas, bukan 500.

### Langkah 1.4 — Login dan sesi

- **Tanyakan user:** keputusan #1 (sesi vs JWT) dan #4 (struktur permission).
- Endpoint login (email + password), logout, dan `GET /auth/me`. Hash password dengan `Bun.password`.
- Middleware otorisasi yang membaca sesi dan `role.permissions`.

**Cek:**
- [ ] Password salah → error, password benar → sesi terbit.
- [ ] Sesi kedaluwarsa ditolak; logout menghapus sesi.
- [ ] Endpoint terproteksi menolak request tanpa sesi (401) dan tanpa permission (403).
- [ ] Password tidak pernah muncul di log maupun response.

### Langkah 1.5 — 2FA TOTP (configurable per role)

- **Tanyakan user:** keputusan #2 (enkripsi secret) dan #3 (backup codes).
- Ikuti flow #4 di dokumen flow: `role.require_2fa` → setup QR (`otpauth` + `qrcode`) → verifikasi kode pertama → set `two_fa_enabled`; login berikutnya wajib TOTP; gagal 5x → lock sementara.
- Admin dapat mengubah `require_2fa` per role.

**Cek:**
- [ ] Role `require_2fa = false` login tanpa 2FA.
- [ ] Role `require_2fa = true`, user belum setup → diarahkan ke QR; kode salah ditolak; kode benar mengaktifkan 2FA.
- [ ] Login berikutnya meminta TOTP; 5 kali salah → akun terkunci sementara dan pesan jelas.
- [ ] Secret 2FA tidak pernah dikirim ke client kecuali saat setup, dan tidak muncul di log.

### Langkah 1.6 — Shell UI ala tldraw

- Setup React (Vite) + Leaflet dengan layer satelit ESRI (atribusi ESRI tetap tampil kecil). Nonaktifkan kontrol zoom bawaan Leaflet.
- Implementasikan layout **section 3 dokumen flow**: peta penuh layar; overlay (`pointer-events: none`) berisi panel (`pointer-events: auto`): kiri atas Logo + menu titik tiga (Katalog Perangkat, Katalog Kabel, Pengaturan, Akun, Logout — item katalog boleh disabled dulu), kanan atas ikon lonceng (belum berfungsi, badge kosong), tengah bawah toolbar pill (Select, Pan, + Perangkat, + Kabel, Search, Clustering, More — semua belum berfungsi, hanya state tool aktif).
- State global "tool aktif": hanya satu tool aktif, ditandai kotak biru; kursor peta menyesuaikan tool.
- Halaman login dan alur 2FA di frontend (terhubung ke API langkah 1.4–1.5).
- **Gaya wajib mengikuti `style-guide.md` secara persis** (font DM Sans, token warna, radius, shadow, ukuran tombol/ikon) — jangan menebak atau memilih nilai lain.

**Cek:**
- [ ] Setelah login, peta satelit tampil penuh layar tanpa scrollbar.
- [ ] Peta tetap bisa di-drag dan di-zoom (scroll) walau ada overlay (bukti pointer-events benar).
- [ ] Posisi: logo kiri atas, lonceng kanan atas, toolbar tengah bawah.
- [ ] Klik tool mengubah tool aktif; hanya satu aktif pada satu waktu.
- [ ] Logout dari menu titik tiga berfungsi dan kembali ke halaman login.
- [ ] Tampilan layak di lebar desktop dan tablet.

### Definition of Done — Fase 1

- [ ] `docker compose up` menjalankan DB + API dari nol, tanpa langkah manual selain `.env` dan migrasi/seed (dokumentasikan perintahnya di README).
- [ ] Seluruh checklist langkah 1.1–1.6 tercentang.
- [ ] Keputusan terbuka #1–#4 sudah dijawab user dan tercatat di README.
- [ ] `.env.example` lengkap; tidak ada secret di repo.
- [ ] Laporan ke user: ringkasan yang dikerjakan, hasil cek, hal yang menyimpang dari plan. **Berhenti, tunggu persetujuan.**

---

# FASE 2 — Inti Pemetaan: Katalog, Perangkat, Kabel, Sidebar

**Tujuan:** user bisa membangun katalog, menempatkan perangkat di peta, menggambar kabel, melihat detail perangkat, dan upload foto. Belum ada monitoring.

### Langkah 2.1 — API katalog (Device Type, Device Model, Cable Type)

- CRUD untuk `device_types`, `device_models`, `cable_types`, dilindungi permission.
- Aturan: kapasitas sesuai tipe (`port_capacity` vs `pon_capacity`); item katalog yang sudah dipakai perangkat/kabel **tidak boleh dihapus** (kembalikan 409 dengan pesan jelas).

**Cek:**
- [ ] CRUD berjalan; validasi menolak kapasitas negatif atau tidak sesuai tipe.
- [ ] Menghapus model yang dipakai perangkat → 409.
- [ ] Role tanpa permission tidak bisa mengubah katalog (403).

### Langkah 2.2 — UI katalog

- Halaman/panel katalog dari menu titik tiga: Katalog Perangkat (type → model, flow #5) dan Katalog Kabel. Form: nama, category, `requires_ip`, icon; vendor, model, kapasitas, `product_url`, `reference_image_url`; untuk kabel: warna, core capacity.
- Tampilan tetap konsisten dengan gaya overlay tldraw (panel putih mengambang).

**Cek:**
- [ ] Contoh dari flow bisa dibuat: Router → Mikrotik CCR2116-12G-4S+, OLT → ZTE C320, kabel Furukawa 24 Core.
- [ ] Item baru langsung muncul sebagai pilihan di form berikutnya tanpa reload.

### Langkah 2.3 — API perangkat

- CRUD `devices` dengan field sesuai ERD; `parent_id` opsional. Validasi: IP wajib dan valid jika Device Type `requires_ip`; `port_used` ≤ kapasitas model.
- Setiap create/update/delete mencatat ke `device_logs` (action, changed_by).
- Endpoint daftar ringan untuk peta (id, nama, lat/lng, type/icon, status).

**Cek:**
- [ ] Validasi IP dan kapasitas bekerja (kasus gagal mengembalikan 400).
- [ ] `device_logs` terisi untuk tiap perubahan.
- [ ] Endpoint daftar tetap cepat dengan ≥ 1.000 perangkat hasil seed uji.

### Langkah 2.4 — UI tambah/edit perangkat di peta

- Tool "+ Perangkat" mengikuti flow #6: klik lokasi → pilih Device Model dari katalog (dengan pencarian) → label instance → (jika `requires_ip`) IP + toggle monitoring + interval → (jika tidak) `port_used` bila perlu → submit.
- Marker sesuai icon Device Type. Marker bisa di-drag untuk pindah lokasi, bisa diedit dan dihapus.
- Jika model belum ada di katalog, arahkan ke katalog (flow #5).
- Setelah submit, tool kembali ke Select.

**Cek:**
- [ ] Menambah perangkat dari katalog tidak meminta input ulang vendor/kapasitas.
- [ ] Marker tampil dengan icon yang benar dan bertahan setelah reload.
- [ ] Drag marker menyimpan koordinat baru.
- [ ] Menambah satu perangkat memakan waktu < 30 detik dari klik tool sampai marker muncul.

### Langkah 2.5 — Kabel (API + UI)

- API CRUD `cables`: `cable_type_id`, `device_from_id`, `device_to_id`, `path` (array koordinat), `length`, `core_used`. Validasi `core_used` ≤ `core_capacity`.
- Tool "+ Kabel" mengikuti flow #7: klik device A → titik tengah opsional → device B → pilih Cable Type → core terpakai dan panjang (auto-hitung geodesik dari path, bisa di-override) → submit.
- Polyline berwarna sesuai Cable Type; klik kabel untuk detail/edit/hapus.

**Cek:**
- [ ] Path tersimpan sebagai array koordinat dan tergambar sama setelah reload.
- [ ] `core_used` melebihi kapasitas ditolak.
- [ ] Panjang auto-hitung mendekati nilai nyata (uji dengan dua titik yang jaraknya diketahui).
- [ ] Menghapus perangkat yang masih punya kabel ditangani jelas (blokir dengan pesan atau cascade yang disepakati — tanyakan user bila ragu).

### Langkah 2.6 — Sidebar detail perangkat

- Klik marker → sidebar slide-in dari kanan sebagai overlay (tidak menggeser layout; lonceng tetap terlihat). Isi sesuai flow #10: info umum, info port (kapasitas vs terpakai), deskripsi (editable), tag (tambah/hapus; auto-create tag baru), galeri (placeholder untuk foto), riwayat `device_logs`.
- Bagian status monitoring ditampilkan sebagai "belum dimonitor" dulu.

**Cek:**
- [ ] Sidebar terbuka/tutup mulus dan tidak memblokir interaksi peta di luar area sidebar.
- [ ] Edit deskripsi dan tag tersimpan.
- [ ] Tag baru otomatis dibuat; tag yang sama tidak terduplikasi (case-insensitive).

### Langkah 2.7 — Upload gambar

- **Tanyakan user:** keputusan #5 (volume lokal atau MinIO).
- Endpoint upload ke `device_images` (caption opsional). Validasi tipe file (gambar saja) dan ukuran (`MAX_UPLOAD_MB`). Tampilkan foto referensi katalog + foto instalasi di galeri; tombol "Tambah Gambar".

**Cek:**
- [ ] Upload gambar valid berhasil dan tampil di galeri setelah reload.
- [ ] File non-gambar atau terlalu besar ditolak dengan pesan jelas.
- [ ] File tersimpan di lokasi yang dipilih dan tetap ada setelah `docker compose restart`.

### Definition of Done — Fase 2

- [ ] Seluruh checklist langkah 2.1–2.7 tercentang.
- [ ] Skenario end-to-end berhasil: buat katalog → tambah 2 perangkat → tarik kabel di antaranya → buka sidebar → upload foto → reload → semua data bertahan.
- [ ] Role Viewer hanya bisa melihat; Teknisi bisa mengubah perangkat/kabel tapi tidak katalog/user (sesuai permission yang disepakati di Fase 1).
- [ ] Keputusan #5 tercatat di README.
- [ ] Laporan ke user lalu **berhenti, tunggu persetujuan.**

---

# FASE 3 — Monitoring, Notifikasi, Pencarian, dan Penyempurnaan

**Tujuan:** perangkat dimonitor otomatis, status tampil real-time di peta, notifikasi berfungsi, pencarian/filter/clustering tersedia, dan aplikasi siap dipakai.

### Langkah 3.1 — Scheduler ping

- **Tanyakan user:** keputusan #7 (retensi `ping_logs`).
- Implementasi satu loop tick (bukan satu `setInterval` per device) sesuai flow #8: ambil perangkat dengan `monitoring_config.enabled` dan `next_check_at <= now`, ping via `child_process.spawn('ping', ...)` dengan timeout (`PING_TIMEOUT_MS`), catat ke `ping_logs`, update `devices.status` bila berubah, set `next_check_at = now + interval_seconds`.
- Batasi konkurensi ping (mis. N paralel) agar tidak membanjiri proses; kegagalan satu perangkat tidak boleh menghentikan loop.
- Endpoint `GET/PUT /devices/:id/monitoring` dan `GET /devices/:id/ping-logs`.
- Job pembersihan `ping_logs` sesuai retensi.

**Cek:**
- [ ] Perangkat yang bisa dijangkau (mis. `127.0.0.1` atau gateway) tercatat `is_up = true` dengan latency masuk akal.
- [ ] IP tak terjangkau tercatat `is_up = false` tanpa menggantung loop (timeout bekerja).
- [ ] Interval dihormati (perangkat 10 detik dicek ± tiap 10 detik; perangkat 60 detik tidak lebih sering).
- [ ] Mematikan monitoring (`enabled = false`) menghentikan pengecekan perangkat itu.
- [ ] Uji dengan ≥ 100 perangkat seed: loop stabil, tidak ada penumpukan proses `ping`.
- [ ] Job retensi menghapus data lama dan tidak menghapus data baru.

### Langkah 3.2 — Status real-time di peta

- Endpoint ringkas `GET /status` (id + status + latency terakhir semua perangkat). Frontend polling berkala (interval dari konfigurasi) dan mengubah warna marker: hijau = up, merah = down, abu = tidak dimonitor — tanpa reload.
- Sidebar menampilkan status, latency, waktu cek terakhir, dan riwayat singkat dari `ping_logs`.

**Cek:**
- [ ] Mengubah target menjadi tak terjangkau → marker berubah merah dalam satu siklus polling, tanpa reload.
- [ ] Polling hanya mengambil data ringkas, bukan seluruh data perangkat.
- [ ] Polling berhenti saat tab tidak aktif (atau diperlambat) agar hemat resource.

### Langkah 3.3 — Notifikasi

- **Tanyakan user:** keputusan #6 (status baca per user atau global).
- Sesuai flow #9: perubahan status membuat record `notifications`; frontend polling; badge angka pada lonceng = jumlah belum dibaca; dropdown daftar (nama device, status baru, waktu); klik item → peta fly-to + sidebar terbuka + tandai dibaca; opsi "Tandai semua dibaca".

**Cek:**
- [ ] Perangkat turun lalu naik → muncul dua notifikasi dengan urutan benar.
- [ ] Badge bertambah/berkurang sesuai jumlah belum dibaca.
- [ ] Klik notifikasi melakukan fly-to dan membuka sidebar perangkat yang benar.
- [ ] Tidak ada notifikasi ganda untuk perubahan status yang sama.

### Langkah 3.4 — Search, filter, tag, clustering

- Search sesuai flow #11: `ILIKE` pada nama device, model, vendor, tag; suggestion dikelompokkan Perangkat / Type / Tag. Pilih perangkat → fly-to + sidebar; pilih Type/Tag → filter chip aktif; beberapa filter dikombinasikan **AND**; chip dihapus lewat tombol X.
- Toolbar "More" menampung filter aktif dan daftar Type/Tag.
- Clustering memakai `leaflet.markercluster` / `react-leaflet-cluster`; toggle menyimpan preferensi di `localStorage`.

**Cek:**
- [ ] Mengetik sebagian nama/vendor/tag menemukan hasil yang benar.
- [ ] Filter Type + Tag bersamaan menampilkan irisan (AND).
- [ ] Menghapus chip mengembalikan marker.
- [ ] Toggle clustering bekerja dan preferensi bertahan setelah reload.
- [ ] Peta tetap responsif dengan ≥ 1.000 marker (clustering aktif).

### Langkah 3.5 — Penyempurnaan dan hardening

- Rate limit pada endpoint login/TOTP; pastikan semua endpoint memeriksa permission di server.
- Pastikan `PING` tidak bisa disalahgunakan: validasi `ip_address` sebelum dipakai di `spawn` (tanpa shell, argumen sebagai array — cegah command injection).
- Penanganan error dan loading state yang rapi di UI; pesan error berbahasa Indonesia.
- Tulis `README.md`: cara setup (`.env`, `docker compose up`, migrasi, seed), daftar variabel `.env`, struktur repo, keputusan yang diambil.

**Cek:**
- [ ] Input IP berisi karakter shell (mis. `1.1.1.1; ls`) ditolak validasi.
- [ ] Brute-force login/TOTP dibatasi.
- [ ] Orang baru bisa menjalankan aplikasi dari nol hanya dengan mengikuti README.
- [ ] Tidak ada secret atau kredensial ter-commit (`git grep` pada pola umum).

### Definition of Done — Fase 3 (dan v1)

- [ ] Seluruh checklist langkah 3.1–3.5 tercentang.
- [ ] Skenario end-to-end penuh (flow #12): login + 2FA → katalog → perangkat → kabel → enable monitoring → perangkat dimatikan → marker merah + notifikasi muncul → klik notifikasi menuju perangkat.
- [ ] Layout sesuai spesifikasi UI: logo kiri atas, notifikasi kanan atas, toolbar tengah bawah, peta penuh layar.
- [ ] Keputusan #6 dan #7 tercatat di README.
- [ ] Laporan akhir ke user: ringkasan fitur, hasil uji, batasan yang diketahui, saran pengembangan lanjutan (mis. cek TCP port sebagai alternatif ICMP, integrasi Mikrotik/SNMP).

---

## Format Laporan Akhir Tiap Fase

```
Fase X selesai.
- Dikerjakan: (ringkas per langkah)
- Hasil pengecekan: (tercentang / gagal + alasan)
- Menyimpang dari plan: (jika ada, dan alasannya)
- Pertanyaan/keputusan yang butuh jawaban user:
- Siap lanjut ke Fase X+1? (menunggu persetujuan)
```
