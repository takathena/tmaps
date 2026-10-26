# Style Guide — Network Device Mapping & Monitoring

Dokumen ini adalah **sumber kebenaran visual**. Dipakai bersama `flow-aplikasi-network-mapping.md` (fungsional) dan `build-plan-3-fase.md` (urutan kerja). Agent wajib mengikuti ini tanpa menebak — jangan pilih font/warna/komponen lain di luar yang tertulis di sini.

---

## 1. Font

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');

:root {
  --font-sans: 'DM Sans', system-ui, sans-serif;
}
```

| Pemakaian | Weight | Size (px) |
|---|---|---|
| Judul panel/modal | 700 | 16–18 |
| Label tombol, menu | 500 | 13–14 |
| Teks biasa, deskripsi | 400 | 13–14 |
| Teks kecil (caption, timestamp) | 400 | 11–12 |

---

## 2. Palet Warna

Diambil dari color picker tldraw. **Blue adalah satu-satunya warna aksen dominan.** Warna lain dipakai sempit dan fungsional (status, tag) — bukan dekorasi — supaya tampilan tetap kalem.

### 2.1 Netral (dasar UI)

| Token | Hex | Pemakaian |
|---|---|---|
| `--color-bg-panel` | `#ffffff` | Latar panel, sidebar, modal |
| `--color-bg-canvas` | `#f8f9fa` | Latar di luar peta (jarang terlihat, peta full-screen) |
| `--color-border` | `#e9ecef` | Border tipis antar elemen |
| `--color-text-primary` | `#1d1d1d` | Teks utama (tldraw "Black") |
| `--color-text-secondary` | `#9fa8b2` | Teks sekunder, placeholder, ikon nonaktif (tldraw "Grey") |

### 2.2 Aksen

| Token | Hex | Pemakaian |
|---|---|---|
| `--color-accent` | `#4465e9` | Tool aktif, tombol utama, link, fokus input (tldraw "Blue") |
| `--color-accent-hover` | `#4f9ae8` | Hover/state turunan dari aksen (tldraw "Light Blue") |

### 2.3 Status perangkat (marker & badge)

| Token | Hex | Arti |
|---|---|---|
| `--color-status-up` | `#099268` | Perangkat up (tldraw "Green") |
| `--color-status-down` | `#e03131` | Perangkat down (tldraw "Red") |
| `--color-status-unmonitored` | `#9fa8b2` | Tidak dimonitor (sama dengan grey netral) |
| `--color-status-warning` | `#f2b84c` | Opsional: latency tinggi / perlu perhatian (tldraw "Yellow") |

### 2.4 Tag (warna berganti per tag, bukan fixed)

Tag dapat memakai salah satu warna berikut secara berurutan/acak per tag baru, supaya tag berbeda mudah dibedakan sekilas:

```
#4465e9 (blue)   #099268 (green)   #e8590c (orange)
#ae3ec9 (violet) #f06595 (pink)    #f2b84c (yellow)
#a78bfa (light-violet)
```

Jangan pakai merah (`--color-status-down`) untuk tag — khusus status down, agar tidak membingungkan di peta.

---

## 3. Bentuk, Bayangan, Spacing

| Token | Nilai |
|---|---|
| `--radius-panel` | 12px |
| `--radius-button` | 8px |
| `--shadow-panel` | `0 2px 8px rgba(0,0,0,.12)` |
| `--size-toolbar-button` | 40px × 40px |
| `--size-icon` | 20px |
| Spacing dasar | kelipatan 4px (4, 8, 12, 16, 24) |

---

## 4. Ikon

- Library: `lucide-react`.
- Outline tipis, bukan filled, ukuran 20px.
- Warna ikon default `--color-text-primary`; ikon pada tool aktif jadi putih di atas latar `--color-accent`.

---

## 5. Komponen Dasar

### 5.1 Panel mengambang (overlay)

```css
.panel {
  background: var(--color-bg-panel);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  font-family: var(--font-sans);
  pointer-events: auto;
}
```

### 5.2 Tombol tool (toolbar)

```css
.tool-button {
  width: var(--size-toolbar-button);
  height: var(--size-toolbar-button);
  border-radius: var(--radius-button);
  display: grid;
  place-items: center;
  color: var(--color-text-primary);
  background: transparent;
}
.tool-button[data-active="true"] {
  background: var(--color-accent);
  color: #ffffff;
}
.tool-button:hover:not([data-active="true"]) {
  background: var(--color-bg-canvas);
}
```

### 5.3 Tombol utama (primary button, mis. "Submit")

```css
.btn-primary {
  background: var(--color-accent);
  color: #ffffff;
  border-radius: var(--radius-button);
  font-weight: 500;
}
.btn-primary:hover {
  background: var(--color-accent-hover);
}
```

### 5.4 Badge notifikasi

```css
.badge {
  background: var(--color-status-down);
  color: #ffffff;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
```

### 5.5 Chip filter (search/filter aktif)

```css
.chip {
  background: var(--color-bg-canvas);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-primary);
  font-size: 13px;
}
```

---

## 6. Implementasi di Tailwind (opsional, disarankan)

Tambahkan token di atas ke `tailwind.config.js` sebagai `extend.colors` dan `extend.fontFamily`, lalu pakai utility class langsung di komponen. Tidak wajib memakai component library besar (shadcn dll) — cukup Tailwind utilities supaya tetap ringan dan sesuai prinsip "simple".

```js
// tailwind.config.js (cuplikan)
theme: {
  extend: {
    fontFamily: { sans: ['DM Sans', 'system-ui', 'sans-serif'] },
    colors: {
      accent: { DEFAULT: '#4465e9', hover: '#4f9ae8' },
      status: { up: '#099268', down: '#e03131', unmonitored: '#9fa8b2', warning: '#f2b84c' },
      panel: '#ffffff',
      canvas: '#f8f9fa',
      border: '#e9ecef',
    },
    borderRadius: { panel: '12px', button: '8px' },
    boxShadow: { panel: '0 2px 8px rgba(0,0,0,.12)' },
  }
}
```

---

## 7. Yang TIDAK boleh dilakukan agent

- Jangan ganti font ke selain DM Sans tanpa persetujuan user.
- Jangan tambah warna aksen kedua yang dominan — blue tetap satu-satunya warna utama.
- Jangan pakai warna merah untuk apa pun selain status down.
- Jangan pakai shadow berlapis, gradient, atau efek dekoratif lain — gaya harus tetap flat dan kalem seperti tldraw.
