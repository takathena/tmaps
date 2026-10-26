# AGENTS.md — Network Device Mapping & Monitoring

Baca file ini dulu di setiap sesi sebelum menulis atau mengubah kode.

## Dokumen acuan (baca dalam urutan ini)

1. `flow-aplikasi-network-mapping.md` — **kebenaran fungsional**: fitur, alur tiap flow, ERD. Jangan tambah fitur di luar ini.
2. `style-guide.md` — **kebenaran visual**: font DM Sans, token warna (palet tldraw), radius, shadow, komponen dasar. Jangan pilih font/warna lain.
3. `build-plan-3-fase.md` — **urutan kerja**: 3 fase, langkah per langkah, checklist pengecekan tiap langkah, Definition of Done tiap fase. Ini yang menentukan apa yang dikerjakan sekarang.

Ketiganya saling melengkapi, bukan duplikat. Kalau ada yang tampak bertentangan, berhenti dan tanyakan ke user — jangan menebak atau memilih salah satu secara sepihak.

## Status proyek saat ini

- Fase aktif: **Fase 1** (lihat `build-plan-3-fase.md`), belum dimulai.
- Belum ada kode. Mulai dari langkah 1.1.

## Aturan kerja (wajib, berlaku sepanjang proyek)

1. Kerjakan **satu langkah dalam satu waktu**, sesuai urutan di `build-plan-3-fase.md`. Jangan lompat fase atau lompat langkah.
2. Setiap langkah punya checklist "Cek" — jalankan semuanya sebelum lanjut ke langkah berikutnya.
3. Di akhir tiap fase, jalankan seluruh "Definition of Done" fase itu, laporkan ke user dengan format di bagian akhir `build-plan-3-fase.md`, lalu **berhenti dan tunggu persetujuan user** sebelum mulai fase berikutnya.
4. Bagian 2 `build-plan-3-fase.md` berisi daftar **Keputusan Terbuka** (sesi vs JWT, enkripsi 2FA secret, storage gambar, dll). Jangan putuskan sendiri — tanyakan ke user tepat sebelum langkah yang disebutkan di tabel itu.
5. Tidak ada hardcode kredensial/konfigurasi — semua lewat `.env`, sediakan `.env.example` yang selalu sinkron.
6. Tidak membangun: reverse proxy, CI/CD, integrasi Mikrotik RouterOS API, atau SNMP. Itu di luar scope v1.
7. Commit kecil dan sering, idealnya satu commit per langkah, dengan pesan yang jelas menyebut nomor langkah (mis. `feat(1.3): kerangka API Hono + health check`).
8. Kalau sebuah pengecekan gagal, perbaiki dulu sebelum lanjut. Kalau tidak bisa diperbaiki sendiri, laporkan ke user dengan pesan error lengkap — jangan lanjut dengan asumsi.
9. Kalau instruksi user di chat bertentangan dengan ketiga file ini, file yang menang **kecuali** user secara eksplisit bilang mau mengubah file tersebut dulu.

## Stack (ringkas, detail di flow doc)

PostgreSQL + PostGIS · Bun + Hono · Drizzle ORM · React + Leaflet (ESRI satellite) · Docker Compose · DM Sans + palet warna tldraw.

## Kalau ragu

Berhenti dan tanya user. Jangan menebak keputusan produk, keputusan keamanan, atau keputusan visual yang tidak tertulis eksplisit di tiga dokumen acuan.
