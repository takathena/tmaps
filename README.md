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

Diisi saat keputusan terbuka Fase 1 dijawab (lihat `build-plan-3-fase.md` Bagian 2).
