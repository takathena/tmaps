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
# edit .env: isi password DB, seed admin, dsb.
docker compose up -d db
bun install
bun run db:migrate
bun run db:seed
bun run dev:api
bun run dev:web
```

API berjalan di `http://localhost:3000`, web di `http://localhost:5173`.

## Perintah

| Perintah | Fungsi |
|---|---|
| `docker compose up -d db` | Menjalankan PostgreSQL + PostGIS |
| `bun install` | Memasang dependency |
| `bun run db:migrate` | Menjalankan migrasi + memastikan PostGIS aktif |
| `bun run db:seed` | Seed role dan admin awal (idempoten) |
| `bun run dev:api` | API mode watch |
| `bun run dev:web` | Web mode dev |
| `bun run typecheck` | Typecheck API + web |

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

Keputusan #2 (enkripsi secret 2FA) dan #3 (backup code) dicatat setelah langkah 1.5.

