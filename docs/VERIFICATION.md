# Hasil verifikasi implementasi

Pemeriksaan pada 4 Oktober 2026. Aplikasi diuji dari UI → API → PostgreSQL sementara dan dari worker → Moodle HTTP tiruan → data → Web Push tiruan. Database Neon asli digunakan hanya pada branch pengujian migrasi.

| Pemeriksaan | Hasil / batas pemeriksaan |
| --- | --- |
| `npm run build` | Lulus pemeriksaan TypeScript frontend/server; menghasilkan `dist/`, manifest, ikon, service worker, dan JavaScript server/CLI di `dist-server/` |
| `npm test` | 23 pengujian lulus; tidak menghubungi Neon produksi atau Moodle kampus |
| Aturan pengingat | H-7 dan tepat 15 hari inklusif; submitted/draf/unknown, deadline kosong/tidak valid, data stale, tanda kelompok, dan jam WIB diuji |
| Database/API | Migrasi idempoten, owner tunggal, sesi HttpOnly, Origin/CSRF, pagination, whitelist, detail di luar whitelist, ignore/restore dan logout perangkat diuji |
| Worker | Login ulang cookie termasuk respons auth terlambat dari request bersamaan, tanggal asli dari kolom Moodle, kegagalan parsial, status submit, kandidat kelas ganda, perubahan generation, dan pergantian lease diuji |
| Web Push | Dua perangkat, deduplikasi jam yang sama, submitted dan data stale, serta validasi host endpoint diuji dengan pengiriman tiruan |
| Neon PostgreSQL asli | Branch `nexus-pwa-implementation`, migration 002 dan idempotensi lulus; 2 users demo, 10 courses, 16 assignments lama tetap utuh |
| Browser Chrome hasil build | Login, cookie setelah reload, dashboard, tugas kelompok, restore, kelas/materi, pengaturan, dan layout 390×844 diperiksa |
| Manifest / service worker | Manifest tersedia; setelah reload, service worker mengontrol halaman. API memakai `no-store` dan strategi `NetworkOnly` |
| Error browser / layout | Tidak ada error aplikasi, overlay, halaman kosong, atau overflow horizontal pada layar yang diperiksa |
| Aksesibilitas otomatis | Login, dashboard desktop dan daftar kelas ponsel: nol pelanggaran setelah perbaikan kontras dan landmark. Pemeriksaan otomatis bukan jaminan seluruh aksesibilitas |
| `npm audit` | Nol kerentanan pada dependency runtime maupun pengembangan setelah update Puppeteer |
| Docker Compose | `docker compose --env-file .env.production.example config --quiet` lulus; engine Linux lokal tidak tersedia untuk menjalankan image |

Screenshot fixture disimpan di `test-results/` yang diabaikan Git. Akun fixture tidak terdapat di database produksi. Koneksi branch sementara disimpan di `.env.test.local` yang diabaikan Git; `.env` yang ada dan database produksi tidak diubah.

Verifikasi yang masih dilakukan saat pemasangan: login Moodle kampus dengan akun pemilik, build/run container pada Linux VPS, HTTPS/domain asli, instal PWA Chrome Android, pengiriman push nyata saat webapp ditutup, reboot VPS, restore backup, dan observasi 24 jam. Langkahnya tersedia di [DEPLOY_LIGHTSAIL.md](DEPLOY_LIGHTSAIL.md).

Branch Neon uji kedaluwarsa pada 6 Oktober 2026 02.00 UTC. Gunakan branch baru untuk pengujian berikutnya dan branch permanen yang sesuai untuk deployment.
