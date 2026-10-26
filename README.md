# TMaps — Network Device Mapping & Monitoring

Aplikasi pemetaan dan monitoring perangkat jaringan. Stack: PostgreSQL + PostGIS,
Bun + Hono, Drizzle ORM, React + Leaflet (satelit ESRI), Docker Compose.

Dokumen acuan ada di repo ini:

- `flow-aplikasi-network-mapping.md` — kebenaran fungsional
- `style-guide.md` — kebenaran visual
- `build-plan-3-fase.md` — urutan kerja

## Prasyarat

- Bun 1.4+
- Docker + Docker Compose

## Setup

```bash
cp .env.example .env
# edit .env: isi password DB, seed admin, CORS, dsb.
# buat kunci enkripsi secret 2FA lalu isi TOTP_ENCRYPTION_KEY:
openssl rand -base64 32
bun install

# Opsi dev: database di Docker, API + web langsung di host.
docker compose up -d db
bun run db:migrate
bun run db:seed
bun run dev:api
bun run dev:web
```

API berjalan di `http://localhost:3000`, web di `http://localhost:5173`.

### Akses lewat VPS/Tailscale

Vite sudah mendengarkan `0.0.0.0:5173`, jadi web bisa dibuka dari perangkat
lain lewat IP VPS. `0.0.0.0` hanya alamat bind di server — **jangan** membukanya
di browser. Gunakan IP atau hostname VPS, misalnya `http://10.10.66.44:5173`.

Sesuaikan `.env` di VPS agar browser memanggil API yang benar dan CORS
mengizinkan origin tersebut:

```bash
VITE_API_URL=http://10.10.66.44:3000
CORS_ORIGIN=http://localhost:5173,http://10.10.66.44:5173
```

Ganti `10.10.66.44` dengan hasil `tailscale ip -4` atau IP LAN VPS. Host pada
URL web dan `VITE_API_URL` harus sama (mis. sama-sama `10.10.66.44`) agar cookie
sesi terkirim; jangan mencampur `localhost` dengan IP. Setelah mengubah `.env`,
restart web (`bun run dev:web`) dan API (`docker compose up -d api`) agar
nilainya terbaca. Pastikan firewall VPS dan Tailscale ACL mengizinkan port
**5173** dan **3000**. Jika membuka lewat hostname MagicDNS, tambahkan hostname
itu ke `server.allowedHosts` di `apps/web/vite.config.ts`; akses lewat IP tidak
memerlukannya.

Untuk menjalankan database **dan API** lewat Docker dari nol:

```bash
docker compose up -d --build
bun install
bun run db:migrate
bun run db:seed
bun run dev:web
```

API container tetap memakai `.env` yang sama. Migrasi dan seed dijalankan dari
host setelah database healthy. Perintah `docker compose down -v` menghapus volume
database (dipakai hanya saat ingin memulai dari nol).

Admin awal dibuat dari `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD`. Role Admin
memiliki `require_2fa = true`, sehingga login pertama akan meminta setup TOTP
(QR ditampilkan oleh frontend, bukan di README).

## Perintah

| Perintah | Fungsi |
|---|---|
| `docker compose up -d db` | Menjalankan PostgreSQL + PostGIS |
| `docker compose up -d api` | Build + jalankan API di container |
| `bun install` | Memasang dependency |
| `bun run db:migrate` | Menjalankan migrasi + memastikan PostGIS aktif |
| `bun run db:seed` | Seed role dan admin awal (idempoten) |
| `bun run dev:api` | API mode watch |
| `bun run dev:web` | Web mode dev |
| `bun run --cwd apps/web build` | Build web untuk produksi |
| `bun run --cwd apps/api test` | Test unit API |
| `bun run typecheck` | Typecheck API + web |

## Endpoint Fase 1

| Method | Path | Akses |
|---|---|---|
| GET | `/health` | publik, cek koneksi DB |
| POST | `/auth/login` | publik, email + password |
| POST | `/auth/2fa/setup` | sesi sementara setup 2FA |
| POST | `/auth/2fa/setup/verify` | sesi sementara setup 2FA |
| POST | `/auth/2fa/verify` | sesi sementara login 2FA |
| POST | `/auth/logout` | publik (menghapus sesi bila ada) |
| GET | `/auth/me` | sesi login |
| GET | `/roles` | permission `roles:read` |
| PATCH | `/roles/:id` | permission `roles:write` (`{ "require2fa": boolean }`) |

Sesi login disimpan di tabel `sessions` dengan `purpose = 'session'`. Sesi
sementara 2FA memakai `purpose = '2fa_setup'` / `'2fa_login'`, berlaku
`TWO_FA_PENDING_TTL_MINUTES`, dan tidak bisa dipakai mengakses endpoint login.

## Endpoint Katalog (Fase 2)

| Method | Path | Akses |
|---|---|---|
| GET | `/catalog/device-types` | `catalog:read` |
| POST | `/catalog/device-types` | `catalog:write` |
| PATCH | `/catalog/device-types/:id` | `catalog:write` |
| DELETE | `/catalog/device-types/:id` | `catalog:delete` |
| GET | `/catalog/device-models?deviceTypeId=` | `catalog:read` |
| POST | `/catalog/device-models` | `catalog:write` |
| PATCH | `/catalog/device-models/:id` | `catalog:write` |
| DELETE | `/catalog/device-models/:id` | `catalog:delete` |
| GET | `/catalog/cable-types` | `catalog:read` |
| POST | `/catalog/cable-types` | `catalog:write` |
| PATCH | `/catalog/cable-types/:id` | `catalog:write` |
| DELETE | `/catalog/cable-types/:id` | `catalog:delete` |

Aturan kapasitas mengikuti jenis Device Type:

- Device Type yang nama/kategorinya memuat **OLT** (atau "Optical Line
  Terminal") wajib memakai `ponCapacity`; `portCapacity` harus kosong.
- Tipe lain (Router, Switch, ODP, ODC, dsb.) wajib memakai `portCapacity`;
  `ponCapacity` harus kosong.
- Kapasitas harus bilangan bulat dan tidak boleh negatif. `coreCapacity` kabel
  harus lebih dari 0 dan warnanya format hex `#RRGGBB`.
- Menghapus device type yang masih punya model, device model yang masih dipakai
  perangkat, atau cable type yang masih dipakai kabel menghasilkan **409**
  dengan pesan yang menyebut jumlah pemakaian.

### Katalog di UI

Buka menu titik tiga di kiri atas lalu pilih **Katalog Perangkat** atau
**Katalog Kabel**. Panel katalog mengambang di atas peta dan bisa ditutup dengan
tombol X atau `Esc`.

- Tab **Perangkat** menampilkan daftar tipe. Pilih satu tipe untuk melihat dan
  mengelola modelnya. Form model hanya meminta kapasitas yang sesuai jenis tipe
  (port atau PON).
- Tab **Kabel** menampilkan tipe kabel beserta warna garis dan jumlah core.
- Item yang baru dibuat langsung muncul di daftar dan pilihan form berikutnya
  tanpa reload.
- Admin dapat menambah, mengedit, dan menghapus. Teknisi/Viewer hanya melihat
  katalog tanpa kontrol perubahan.
- Menghapus item memakai konfirmasi inline; pesan 409 dari API ditampilkan di
  panel bila item masih dipakai.

## 2FA

- Secret TOTP dienkripsi AES-256-GCM dengan kunci `TOTP_ENCRYPTION_KEY`
  (base64 32 byte) sebelum disimpan ke `users.two_fa_secret`.
- Kode TOTP 6 digit, periode 30 detik, toleransi ±1 periode.
- Setelah 5 kode salah, akun terkunci sementara (`TWO_FA_LOCK_MINUTES`).
- Tidak ada backup code di v1. Jika user kehilangan authenticator, admin
  mereset 2FA lewat DB, lalu user melakukan setup ulang:

```sql
UPDATE users
SET two_fa_enabled = false,
    two_fa_secret = NULL,
    two_fa_failed_attempts = 0,
    two_fa_locked_until = NULL
WHERE email = 'email-user@example.com';

DELETE FROM sessions
WHERE user_id = (SELECT id FROM users WHERE email = 'email-user@example.com')
  AND purpose IN ('2fa_setup', '2fa_login');
```

Setelah reset, user login dengan password dan akan diarahkan ke setup QR lagi.

## Frontend Fase 1

- Halaman login, verifikasi TOTP, dan setup QR terhubung langsung ke API.
  `VITE_API_URL` dibaca dari `.env` di root repo (Vite memakai `envDir` root).
- Setelah login, peta satelit ESRI tampil penuh layar. Container overlay memakai
  `pointer-events: none`; hanya panel (logo/menu, lonceng, toolbar) yang menerima
  klik, sehingga peta tetap bisa di-drag dan di-zoom di area kosong.
- Toolbar bawah hanya menyimpan state tool aktif pada Fase 1. Menu katalog,
  pengaturan, dan akun ditandai "Segera" karena fiturnya baru dibangun pada fase
  berikutnya. Lonceng belum menampilkan notifikasi.
- Peta membutuhkan koneksi internet untuk tile ESRI dan font DM Sans dari Google
  Fonts. Tanpa internet, peta tetap tampil dengan latar netral dan font fallback.

## Struktur

```
apps/api   — Bun + Hono + Drizzle
apps/web   — React + Vite + Leaflet
db/init    — inisialisasi PostGIS untuk volume baru
```

## Keputusan yang Diambil

### Fase 1

| # | Keputusan | Pilihan |
|---|---|---|
| 1 | Mekanisme sesi | **Sesi DB** (token opaque acak, disimpan sebagai hash SHA-256 di `sessions`, dikirim lewat cookie `HttpOnly` `SameSite=Lax`). Logout menghapus sesi. |
| 2 | Enkripsi secret 2FA | **AES-256-GCM**, kunci 32 byte dari `TOTP_ENCRYPTION_KEY` (base64). Format ciphertext `v1.<iv>.<tag>.<ciphertext>`. |
| 3 | Backup code 2FA | **Tidak ada di v1**. Reset manual lewat prosedur SQL di bagian 2FA. |
| 4 | Struktur permission | **Resource + action** di `roles.permissions`: `{ "<resource>": { "read": true, "write": false, "delete": false } }`. |

Resource yang dipakai: `catalog`, `devices`, `cables`, `monitoring`, `notifications`, `users`, `roles`.
Action: `read`, `write`, `delete`. Permission yang tidak ada dianggap ditolak.

Matriks seed bawaan:

| Role | catalog | devices | cables | monitoring | notifications | users | roles | require_2fa |
|---|---|---|---|---|---|---|---|---|
| Admin | RW D | RW D | RW D | RW D | RW D | RW D | RW D | ya |
| Teknisi | R | RW D | RW D | RW | RW | – | – | tidak |
| Viewer | R | R | R | R | R | – | – | tidak |

`R` = read, `W` = write, `D` = delete, `–` = tidak ada akses.

Keputusan #5 (storage gambar), #6 (status baca notifikasi), dan #7 (retensi
`ping_logs`) dicatat saat fase terkait.

