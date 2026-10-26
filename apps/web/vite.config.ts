import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // .env berada di root monorepo, bukan di apps/web.
  envDir: "../..",
  server: {
    // Dengarkan semua interface agar bisa diakses lewat Tailscale/LAN.
    // Alamat yang dibuka di browser tetap IP VPS, bukan 0.0.0.0.
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
});
