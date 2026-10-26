# Flow Aplikasi — Network Device Mapping & Monitoring (v2)

Stack: **PostgreSQL + PostGIS**, **Bun + Hono** (API), **React + Leaflet (ESRI satellite)**, **Drizzle ORM**. Deploy via **Docker Compose**, dev langsung pakai **Bun**, konfigurasi lewat **.env**, tanpa reverse proxy, tanpa CI/CD.

Perubahan dari versi sebelumnya:

- Layout UI disamakan dengan tldraw: logo kiri atas, notifikasi kanan atas, toolbar tengah bawah.
- Akun/logout/katalog dipindah ke menu titik tiga di samping logo.
- Ditambah flow notifikasi perubahan status.
- ERD ditambah `TAGS`, `DEVICE_TAGS`, `NOTIFICATIONS`, dan kolom `next_check_at`.
- Penomoran section dirapikan berurutan.

---

## 1. Arsitektur Sistem

```mermaid
flowchart LR
    subgraph Browser
        A[React App] --> B[Leaflet Map<br/>+ ESRI Satellite Layer]
    end

    A -->|REST / Hono RPC| C[Hono API - Bun runtime]
    C --> D[Drizzle ORM]
    D --> E[(PostgreSQL + PostGIS)]
    C --> F[Ping Scheduler<br/>background loop]
    F --> E
    C --> S[(Storage gambar<br/>volume lokal / MinIO)]

    C -. opsional .-> G[Mikrotik RouterOS API]
    C -. opsional .-> H[SNMP: Cisco / Juniper / OLT]
```

---

## 2. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    ROLES ||--o{ USERS : has
    USERS ||--o{ SESSIONS : has
    DEVICE_TYPES ||--o{ DEVICE_MODELS : classifies
    DEVICE_MODELS ||--o{ DEVICES : instantiates
    DEVICES ||--o{ DEVICE_IMAGES : has
    CABLE_TYPES ||--o{ CABLES : classifies
    DEVICES ||--o{ DEVICES : "parent_id (topologi)"
    DEVICES ||--o{ CABLES : "device_from"
    DEVICES ||--o{ CABLES : "device_to"
    DEVICES ||--o| MONITORING_CONFIG : configures
    DEVICES ||--o{ PING_LOGS : logs
    DEVICES ||--o{ DEVICE_LOGS : logs
    DEVICES ||--o{ DEVICE_TAGS : tagged
    TAGS ||--o{ DEVICE_TAGS : tagged
    DEVICES ||--o{ NOTIFICATIONS : triggers

    ROLES {
        uuid id PK
        string name
        boolean require_2fa
        jsonb permissions
    }
    USERS {
        uuid id PK
        string email
        string password_hash
        uuid role_id FK
        string two_fa_secret
        boolean two_fa_enabled
    }
    SESSIONS {
        uuid id PK
        uuid user_id FK
        string token
        timestamp expires_at
    }
    DEVICE_TYPES {
        uuid id PK
        string name
        string category
        boolean requires_ip
        string icon
    }
    DEVICE_MODELS {
        uuid id PK
        uuid device_type_id FK
        string vendor
        string model_name
        int port_capacity
        int pon_capacity
        string product_url
        string reference_image_url
    }
    DEVICES {
        uuid id PK
        string name
        uuid device_model_id FK
        string ip_address
        float latitude
        float longitude
        uuid parent_id FK
        int port_used
        string description
        string status
        timestamp installed_at
    }
    DEVICE_IMAGES {
        uuid id PK
        uuid device_id FK
        string image_url
        string caption
        timestamp uploaded_at
    }
    CABLE_TYPES {
        uuid id PK
        string vendor
        string model_name
        string color
        int core_capacity
        string product_url
    }
    CABLES {
        uuid id PK
        uuid cable_type_id FK
        uuid device_from_id FK
        uuid device_to_id FK
        jsonb path
        float length
        int core_used
    }
    MONITORING_CONFIG {
        uuid id PK
        uuid device_id FK
        boolean enabled
        int interval_seconds
        timestamp next_check_at
    }
    PING_LOGS {
        uuid id PK
        uuid device_id FK
        boolean is_up
        int latency_ms
        timestamp checked_at
    }
    DEVICE_LOGS {
        uuid id PK
        uuid device_id FK
        string action
        string changed_by
        timestamp created_at
    }
    TAGS {
        uuid id PK
        string name
    }
    DEVICE_TAGS {
        uuid device_id FK
        uuid tag_id FK
    }
    NOTIFICATIONS {
        uuid id PK
        uuid device_id FK
        boolean is_up
        string message
        boolean is_read
        timestamp created_at
    }
```

---

## 3. Layout UI — Map Full-Screen dengan Overlay Mengambang (ala tldraw)

Map jadi base layer penuh layar. Semua kontrol adalah panel mengambang di atasnya, bukan bagian dari flex layout biasa.

```mermaid
flowchart TD
    subgraph Screen[Layar penuh]
        TL[Kiri atas:<br/>Logo + menu titik tiga<br/>akun, pengaturan, katalog, logout]
        TR[Kanan atas:<br/>Ikon notifikasi lonceng + badge]
        MAP[Peta satelit ESRI - base layer]
        BC[Tengah bawah:<br/>Toolbar pill]
        SB[Kanan, saat marker diklik:<br/>Sidebar detail slide-in]
    end
```

Susunan visual:

```
┌──────────────────────────────────────────────┐
│ [Logo] ⋮                                🔔   │
│                                              │
│                                              │
│              (peta satelit penuh)            │
│                                              │
│                                              │
│     ┌────────────────────────────────────┐   │
│     │ ↖  ✋  + Perangkat  + Kabel  🔍  ◎  ⌃ │   │
│     └────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

**Toolbar tengah bawah** (satu tool aktif pada satu waktu, ditandai kotak biru):

| Tool | Fungsi |
|---|---|
| Select | Pilih marker/kabel, buka sidebar |
| Pan | Geser peta |
| + Perangkat | Mode tambah perangkat (flow #6) |
| + Kabel | Mode gambar kabel (flow #7) |
| Search | Buka search box (flow #10) |
| Clustering | Toggle cluster marker (flow #10) |
| ⌃ More | Filter Type / Tag aktif |

**Menu titik tiga (kiri atas):** Katalog Perangkat, Katalog Kabel, Pengaturan, Akun, Logout. Kelola User/Role hanya tampil untuk role dengan permission terkait.

**Gaya visual:** panel putih, `border-radius` ±12px, bayangan lembut, ikon outline tipis (lucide-react) ukuran 20px, tombol 40×40px, satu warna aksen biru, font Inter.

**Struktur komponen:**

```tsx
<div className="app-root">        {/* relative, 100vw/100vh, overflow hidden */}
  <MapView />                      {/* absolute inset-0, z-0 */}
  <div className="overlay">        {/* absolute inset-0, pointer-events: none, z-10 */}
    <TopLeft />                    {/* panel: Logo + MainMenu */}
    <TopRight />                   {/* panel: NotificationBell */}
    <BottomCenter />               {/* panel: Toolbar */}
  </div>
  <DeviceSidebar />                {/* absolute right-0, slide-in, z-20 */}
</div>
```

Catatan penting: container overlay pembungkus penuh layar wajib `pointer-events: none` supaya klik/drag map di baliknya tidak terblokir; tiap panel di dalamnya memakai `pointer-events: auto`. Kontrol bawaan Leaflet (zoom +/-) dinonaktifkan atau dipindah; atribusi ESRI tetap ditampilkan kecil di kanan bawah.

---

## 4. Flow Login & 2FA (configurable per role)

```mermaid
flowchart TD
    Start([User buka app]) --> Login[Input email & password]
    Login --> ValidPW{Password valid?}
    ValidPW -- Tidak --> ErrPW[Tampilkan error]
    ErrPW --> Login
    ValidPW -- Ya --> CheckRole{role.require_2fa = true?}

    CheckRole -- Tidak --> IssueSession[Issue session token]
    CheckRole -- Ya --> Check2FAEnabled{user.two_fa_enabled?}

    Check2FAEnabled -- Belum --> SetupQR[Tampilkan QR Code TOTP]
    SetupQR --> InputFirstCode[User input kode 6 digit]
    InputFirstCode --> VerifyFirst{Kode valid?}
    VerifyFirst -- Tidak --> SetupQR
    VerifyFirst -- Ya --> EnableFlag[Set two_fa_enabled = true]
    EnableFlag --> IssueSession

    Check2FAEnabled -- Sudah --> InputTOTP[Input kode TOTP]
    InputTOTP --> VerifyTOTP{Kode valid?}
    VerifyTOTP -- Tidak --> Lock{Gagal 5x?}
    Lock -- Ya --> LockAccount[Lock sementara]
    Lock -- Tidak --> InputTOTP
    VerifyTOTP -- Ya --> IssueSession

    IssueSession --> Dashboard([Masuk peta full-screen sesuai role])
```

---

## 5. Flow Katalog Perangkat (Device Type → Device Model) & Cable Type

Katalog dibangun **sekali**, lalu dipakai berkali-kali saat menempatkan perangkat di peta — bukan input ulang spek tiap lokasi. Diakses dari menu titik tiga di kiri atas.

```mermaid
flowchart TD
    A([Admin buka menu ⋮ lalu 'Katalog Perangkat']) --> B{Device Type sudah ada?}
    B -- Belum, misal 'OLT' belum ada --> C[Buat Device Type baru:<br/>nama, category, requires_ip, icon]
    B -- Sudah ada --> D[Pilih Device Type existing]
    C --> D
    D --> E[Buat Device Model:<br/>vendor + model name]
    E --> F{Jenis kapasitas?}
    F -- Router/Switch --> G[Isi port_capacity]
    F -- OLT --> H[Isi pon_capacity]
    F -- ODP/ODC pasif --> I[Isi port_capacity]
    G --> J[Simpan ke device_models]
    H --> J
    I --> J
    J --> K([Model tersimpan di katalog,<br/>siap dipilih berkali-kali di manapun])
```

Contoh: buat Device Type **Router** → Device Model **Mikrotik CCR2116-12G-4S+** (port capacity diisi); buat Device Type baru **OLT** → Device Model **ZTE C320** (PON capacity diisi); buat Device Type **ODP**/**ODC** → model-model pasif dengan port capacity masing-masing.

**Cable Types mengikuti pola yang sama** (katalog, bukan per-instance):

```mermaid
flowchart TD
    A([Admin buka menu ⋮ lalu 'Katalog Kabel']) --> B[Buat Cable Type:<br/>vendor + model name]
    B --> C[Isi core_capacity, warna garis,<br/>product_url opsional]
    C --> D[Simpan ke cable_types]
    D --> E([Model kabel tersimpan,<br/>siap dipilih berkali-kali saat '+ Kabel'])
```

Contoh: buat Cable Type **Furukawa Fiber Optic 24 Core Single-mode ADSS** sekali → setiap kali menggambar kabel fisik di peta, tinggal pilih model ini dari katalog.

---

## 6. Flow Tambah Perangkat di Map (pakai katalog, cepat & berulang)

```mermaid
flowchart TD
    A([Klik tool '+ Perangkat' di toolbar bawah]) --> B[Klik lokasi di peta]
    B --> C[Cari & pilih Device Model dari katalog,<br/>misal 'Mikrotik CCR2116-12G-4S+']
    C --> D[Isi label instance, misal<br/>'Mikrotik Core - Gudang A']
    D --> E{Device Type ini requires_ip?}
    E -- Ya --> F[Isi IP yang akan di-ping]
    F --> G[Toggle 'Enable Monitoring' + interval]
    E -- Tidak --> H[Isi port_used jika perlu - ODP/ODC]
    G --> I[Submit]
    H --> I
    I --> J[Simpan ke devices:<br/>device_model_id + lokasi + IP]
    J --> L[Catat ke device_logs]
    L --> K([Marker muncul di peta sesuai icon type,<br/>langsung termonitor jika aktif])
```

Spek (vendor, port/PON capacity) tidak diketik ulang — otomatis menempel dari `device_models` yang dipilih. Kalau model belum ada di katalog, admin diarahkan ke flow #5 dulu. Setelah submit, tool kembali ke Select.

---

## 7. Flow Tambah & Gambar Kabel di Map (pakai katalog kabel)

```mermaid
flowchart TD
    A([Klik tool '+ Kabel' di toolbar bawah]) --> B[Mode drawing aktif]
    B --> C[Klik device awal - titik A]
    C --> D[Klik titik tengah opsional<br/>mengikuti jalur fisik]
    D --> E[Klik device akhir - titik B]
    E --> F[Cari & pilih Cable Type dari katalog,<br/>misal 'Furukawa 24 Core Single-mode']
    F --> G[Isi core terpakai, panjang<br/>auto-hitung dari koordinat / manual]
    G --> H[Submit]
    H --> I[Simpan ke tabel cables<br/>path tersimpan sebagai array koordinat]
    I --> J[Polyline tergambar di peta<br/>warna sesuai cable type]
    J --> K[Relasi topologi device A-B terbentuk]
```

Spek kabel (vendor, core capacity) otomatis menempel dari `cable_types` yang dipilih. Validasi: `core_used` tidak boleh melebihi `core_capacity`.

---

## 8. Flow Monitoring (Ping Otomatis)

```mermaid
flowchart TD
    A[Scheduler tick setiap N detik] --> B{Ada device dengan<br/>next_check_at <= now?}
    B -- Tidak --> A
    B -- Ya --> C[Ping device.ip_address]
    C --> D{Response diterima?}
    D -- Ya --> E[is_up = true, catat latency]
    D -- Tidak --> F[is_up = false]
    E --> G[Simpan ke ping_logs]
    F --> G
    G --> H{Status berubah dari sebelumnya?}
    H -- Ya --> I[Update devices.status<br/>active <-> offline]
    I --> N[Buat record notifications]
    H -- Tidak --> J[Skip update status]
    N --> K[Set next_check_at = now + interval_seconds]
    J --> K
    K --> A
```

Frontend polling status device secara berkala → marker di peta berubah warna (hijau = up, merah = down, abu = tidak dimonitor) tanpa reload halaman.

---

## 9. Flow Notifikasi (kanan atas)

```mermaid
flowchart TD
    A[Scheduler mendeteksi perubahan status] --> B[Simpan ke notifications:<br/>device, is_up, message, is_read=false]
    B --> C[Frontend polling /notifications]
    C --> D[Badge angka pada ikon lonceng<br/>= jumlah is_read=false]
    D --> E([User klik lonceng])
    E --> F[Dropdown daftar notifikasi:<br/>nama device, status baru, waktu]
    F --> G{User klik item?}
    G -- Ya --> H[Peta fly-to ke device<br/>+ sidebar detail terbuka]
    H --> I[Tandai notifikasi sudah dibaca]
    G -- Tidak --> J[Opsional: 'Tandai semua dibaca']
    J --> I
    I --> K[Badge berkurang]
```

---

## 10. Flow Sidebar Detail Perangkat & Upload Gambar

Sidebar slide-in dari kanan sebagai overlay di atas peta (tidak menggeser layout). Ikon notifikasi di kanan atas tetap terlihat.

```mermaid
flowchart TD
    A([Klik marker perangkat di peta]) --> B[Sidebar terbuka]
    B --> C[Info Umum: vendor, model, type<br/>- dari device_models]
    B --> D[Info Port: capacity and used<br/>- dari device_models + devices]
    B --> M[Status monitoring: up/down, latency,<br/>cek terakhir - dari ping_logs]
    B --> E[Deskripsi: catatan bebas<br/>- dari devices.description]
    B --> T[Tag: tambah/hapus langsung dari sidebar]
    B --> F[Galeri Gambar]
    F --> G[Foto referensi katalog<br/>- otomatis dari device_models.reference_image_url]
    F --> H[Foto instalasi aktual<br/>- dari device_images, bisa banyak]
    H --> I{Klik 'Tambah Gambar'?}
    I -- Ya --> J[Upload file]
    J --> K[Simpan file ke storage<br/>- volume lokal atau MinIO]
    K --> L[Simpan record ke device_images]
    L --> H
```

Foto referensi katalog otomatis sama untuk semua instance model yang sama (bantu identifikasi visual); foto instalasi spesifik per lokasi (bantu verifikasi kondisi lapangan).

---

## 11. Fitur Nice-to-Have: Search, Filter by Type, Tag, & Clustering

**Tags** (many-to-many): satu device bisa punya banyak tag (misal "Sidoarjo" + "Backbone" sekaligus).

```mermaid
flowchart TD
    A([User klik tool Search / ketik di search box]) --> B[Query dicocokkan ke:<br/>nama device, model, vendor, tag]
    B --> C[Dropdown suggestion muncul,<br/>dikelompokkan: Perangkat / Type / Tag]
    C --> D{User pilih apa?}
    D -- Pilih nama device --> E[Map fly-to + sidebar detail terbuka]
    D -- Pilih Type misal 'OLT' --> F[Filter chip 'Type: OLT' aktif]
    D -- Pilih Tag misal 'Sidoarjo' --> G[Filter chip 'Tag: Sidoarjo' aktif]
    F --> H[Map hanya tampilkan marker<br/>sesuai filter aktif - kombinasi AND]
    G --> H
    H --> I{Tambah filter lain?}
    I -- Ya --> C
    I -- Tidak --> J([Filter dihapus lewat tombol X di chip])
```

**Clustering toggle:**

```mermaid
flowchart TD
    A([User klik toggle 'Clustering' di toolbar]) --> B{Status sekarang?}
    B -- Aktif ke Nonaktif --> C[Marker ditampilkan satu-satu<br/>tanpa pengelompokan]
    B -- Nonaktif ke Aktif --> D[Marker dekat dikelompokkan<br/>jadi satu bubble angka]
    C --> E[Preferensi disimpan - localStorage]
    D --> E
```

---

## 12. Flow Besar End-to-End (Ringkasan)

```mermaid
flowchart LR
    A[1. Login + 2FA sesuai role] --> B[2. Bangun Katalog Perangkat & Kabel<br/>sekali saja, bertahap]
    B --> C[3. Tempatkan Perangkat di Map<br/>pilih dari katalog - berulang, cepat]
    C --> D[4. Tambah Kabel menghubungkan<br/>antar perangkat]
    D --> E[5. Enable Monitoring<br/>per device aktif]
    E --> F[6. Scheduler ping berjalan<br/>sesuai interval]
    F --> G[7. Status peta ter-update<br/>+ notifikasi di kanan atas]
```

Katalog (langkah 2) dibangun bertahap sesuai kebutuhan — tidak harus lengkap di awal. Begitu model baru ditemukan di lapangan (misal ONU tipe baru), tinggal tambah sekali ke katalog, lalu bisa dipakai untuk semua instance berikutnya.

---

## Catatan Implementasi Penting

- **PostGIS**: aktifkan extension untuk query spasial (cari perangkat terdekat, dsb) jika dibutuhkan ke depan.
- **Ping dari Bun**: tidak ada raw ICMP native — gunakan `child_process.spawn('ping', ...)` atau library `ping`; pastikan binary `ping` ada di image Docker API.
- **Scheduler**: hindari satu `setInterval` per device; gunakan satu loop tick + kolom `next_check_at` per device (ada di `monitoring_config`).
- **2FA**: TOTP via library `otpauth`, QR via `qrcode`, password hashing pakai `Bun.password` (built-in).
- **.env**: semua kredensial & konfigurasi (DB, port, `VITE_API_URL`, batas upload) lewat `.env`, tidak ada hardcode; sertakan `.env.example` di repo.
- **Search**: awal pakai `ILIKE` di Postgres (nama/model/vendor + join tags), upgrade ke `pg_trgm` kalau butuh fuzzy search di skala besar.
- **Clustering**: library `leaflet.markercluster` / `react-leaflet-cluster`, toggle state disimpan di localStorage.
- **Tag**: input bebas, auto-create kalau belum ada, bisa ditambah langsung dari sidebar device.
- **UI overlay**: container overlay `pointer-events: none`, panel `pointer-events: auto`; nonaktifkan kontrol zoom bawaan Leaflet.
- **Retensi `ping_logs`**: perlu kebijakan hapus data lama agar tabel tidak membengkak.
- **Belum diputuskan**: enkripsi `two_fa_secret`, mekanisme recovery/backup codes, JWT vs session DB, granularity permission per role, status baca notifikasi per user atau global.
