# Memasang NEXUS di VPS Linux / AWS Lightsail

Panduan ini memakai **instance baru Ubuntu 24.04 LTS, OS Only, x86_64**. Aplikasi terdiri dari web/API dan worker terpisah di Docker Compose, Nginx untuk HTTPS, dan PostgreSQL di Neon yang sudah ada. Semua perintah Linux dijalankan lewat SSH sebagai `ubuntu`, kecuali disebutkan lain.

## 1. Pilihan VPS dan biaya

Mulai dengan Lightsail **Micro: 1 GB RAM, 2 vCPU, 40 GB SSD, public IPv4, USD 7/bulan**, region Jakarta jika tersedia pada akun. Tambahkan swap 1 GB. Paket dan harga tersebut tercantum di [daftar bundle resmi Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html), diperiksa 4 Oktober 2026. Harga belum termasuk pajak, domain, snapshot, transfer berlebih, dan penggunaan Neon di luar jatah akun.

Paket 2 GB / USD 12 dapat dipilih jika pemakaian nyata menunjukkan memori tidak cukup. Ini perkiraan awal untuk satu pemilik dan sembilan kelas; pengukuran 24 jam tetap diperlukan. Aplikasi tidak menggunakan database Lightsail berbayar, load balancer, Redis, atau headless Chrome pada runtime.

Di AWS Console: Lightsail → Create instance → Linux/Unix → OS Only → Ubuntu 24.04 LTS → paket 1 GB dengan IPv4 → nama `nexus-lms`. Gunakan SSH key sendiri atau key Lightsail dan simpan key di komputer pribadi. Buat alarm biaya di AWS Budgets, misalnya USD 10/bulan, serta pantau pemakaian Neon di dashboard Neon. Angka budget adalah alarm, bukan pembatas tagihan otomatis.

## 2. Static IP, domain, dan firewall

1. Lightsail → Networking → Create static IP → pasangkan ke instance. Static IP yang tetap terpasang disertakan dalam bundle; static IP lepas dapat ditagih, lihat [FAQ billing Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html).
2. Buat DNS **A** `tugas.domainmu.com` → static IPv4. Domain boleh dikelola di penyedia DNS yang sudah ada. Hapus AAAA lama jika IPv6 belum disiapkan. Saat menyiapkan sertifikat pertama, gunakan DNS-only apabila ada proxy DNS.
3. Firewall Lightsail: TCP 22 hanya dari IP komputer yang digunakan untuk SSH; TCP 80 dan 443 dari publik. Jangan membuka 4000, 4001, atau 5432.
4. SSH dari komputer, contoh PowerShell:

```powershell
ssh -i C:\lokasi\lightsail.pem ubuntu@IP_STATIC
```

Periksa server dan DNS:

```bash
cat /etc/os-release
uname -m
free -h
getent ahostsv4 tugas.domainmu.com
```

## 3. Persiapan Ubuntu dan swap

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx ufw gnupg
sudo timedatectl set-timezone Asia/Jakarta
```

Pastikan sinkronisasi waktu aktif dengan `timedatectl status`. Deadline disimpan dalam UTC dan ditampilkan dalam WIB, sehingga jam server harus benar.

Pada instance baru yang belum memiliki `/swapfile`:

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
printf '/swapfile none swap sw 0 0\n' | sudo tee -a /etc/fstab
printf 'vm.swappiness=10\n' | sudo tee /etc/sysctl.d/99-nexus-swap.conf
sudo sysctl --system
swapon --show
```

Jalankan bagian swap sekali. Pada VPS yang sudah digunakan, cek `swapon --show` dan `/etc/fstab` sebelum menambah swap.

Aktifkan firewall host setelah SSH diizinkan:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

## 4. Instal Docker Engine dan Compose

Gunakan repository resmi Docker, sesuai [panduan Docker untuk Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Contoh berikut khusus Ubuntu 24.04 amd64:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
printf 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable\n' | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker nginx
sudo usermod -aG docker ubuntu
```

Keluar SSH lalu masuk lagi agar keanggotaan grup berlaku. Grup Docker mempunyai kewenangan setara root; hanya masukkan akun operator server.

```bash
docker version
docker compose version
docker run --rm hello-world
```

Compose hanya menerbitkan port API ke `127.0.0.1:4000`; worker tidak menerbitkan port host. Ini diperlukan karena port Docker yang diterbitkan ke semua interface dapat melewati aturan UFW.

## 5. Salin proyek

Clone kode dari repository GitHub:

```bash
sudo mkdir -p /opt/nexus-lms
sudo chown ubuntu:ubuntu /opt/nexus-lms
git clone https://github.com/sindufha/clone.git /opt/nexus-lms
cd /opt/nexus-lms
```

Kode yang belum di-push dapat dikirim dari komputer Windows menggunakan arsip **tanpa** `node_modules`, `.git`, `.env*`, `.neon`, data hasil scrape, dan direktori akun/credential. Misalnya dari direktori proyek di PowerShell:

```powershell
tar -czf nexus-source.tar.gz Dockerfile compose.yaml .dockerignore .env.production.example package.json package-lock.json tsconfig.json tsconfig.server.json vite.config.ts index.html neon.ts src shared server scripts public database deploy docs README.md
scp -i C:\lokasi\lightsail.pem nexus-source.tar.gz ubuntu@IP_STATIC:~/
```

Di VPS:

```bash
sudo mkdir -p /opt/nexus-lms
sudo chown ubuntu:ubuntu /opt/nexus-lms
tar -xzf ~/nexus-source.tar.gz -C /opt/nexus-lms
cd /opt/nexus-lms
```

Arsip menyertakan `.env.production.example` yang hanya berisi placeholder. File `.env` dan secret komputer tidak disertakan.

## 6. Siapkan Neon dan konfigurasi aplikasi

Di Neon Console pilih proyek LMS yang sudah ada. Gunakan connection string database/role yang memang dipakai aplikasi:

- `DATABASE_URL`: connection **pooled**, hostname mengandung `-pooler`.
- `DATABASE_URL_UNPOOLED`: connection **direct**, untuk migrasi, backup, dan restore.
- Gunakan `sslmode=verify-full` agar verifikasi sertifikat dan hostname tetap eksplisit.

Uji migrasi di branch pengembangan lebih dahulu. Branch uji `nexus-pwa-implementation` dibuat pada 4 Oktober 2026, diuji, dan dijadwalkan kedaluwarsa **6 Oktober 2026 02.00 UTC**. Buat branch uji baru jika sudah kedaluwarsa; jangan gunakan branch sementara itu untuk deployment permanen. `.env.test.local` hanya tersimpan di komputer pengembangan dan diabaikan Git.

Pada instance baru:

```bash
cd /opt/nexus-lms
cp .env.production.example .env
chmod 600 .env
nano .env
```

Isi `APP_URL=https://tugas.domainmu.com`, dua URL Neon, `LMS_BASE_URL=https://lms.itmnganjuk.ac.id`, `LMS_TIMEZONE=Asia/Jakarta`, dan `VAPID_SUBJECT=mailto:emailmu@example.com`. Jangan isi NIM atau password Moodle di `.env`; keduanya dimasukkan lewat halaman Pengaturan setelah login.

Bangun image sebelum menjalankan layanan. Untuk server 1 GB, hentikan build/proses lain yang berat dan pastikan swap sudah aktif:

```bash
docker compose build web
```

Generate tiga kunci sekali dengan image yang baru dibuat. Script ini sengaja menampilkan kunci ke terminal operator; jangan membagikan hasilnya:

```bash
docker compose run --rm --no-deps web node dist-server/scripts/keys.js
nano .env
```

Masukkan hasil ke `CREDENTIAL_ENCRYPTION_KEY`, `VAPID_PUBLIC_KEY`, dan `VAPID_PRIVATE_KEY`. Kunci enkripsi adalah 32 byte dalam base64. Simpan cadangan kunci terpisah dari backup database. Tanpa kunci yang sama, password/cookie Moodle di database tidak bisa dibaca lagi.

Kunci VAPID harus dipertahankan saat update. Menggantinya memerlukan langganan push baru di semua perangkat: tekan **Nonaktifkan perangkat**, lalu **Aktifkan notifikasi**. Bila kunci enkripsi hilang, generate kunci baru lalu hubungkan ulang Moodle; password yang lama tidak dapat dipulihkan.

## 7. Migrasi database dan buat owner

Sebelum menjalankan ini dengan URL produksi, cadangkan database sesuai bagian backup. Migrasi `002_personal_pwa.sql` menambah tabel pribadi; data snapshot demo di tabel lama tetap disimpan dan tidak digunakan untuk pengingat.

Untuk menguji di branch lain, simpan konfigurasi branch itu di direktori pengembangan terpisah. Jangan menukar `.env` server produksi yang sedang berjalan. Jalankan:

```bash
docker compose run --rm --no-deps web node dist-server/scripts/migrate.js
```

Migrasi memakai koneksi direct, transaksi, advisory lock PostgreSQL, dan daftar versi terurut. Aman dijalankan ulang; versi yang sudah diterapkan dilewati.

Setelah migrasi target produksi berhasil, buat satu owner:

```bash
docker compose run --rm --no-deps web node dist-server/scripts/owner.js
```

Isi username aplikasi, nama tampilan, dan password minimal 12 karakter, maksimal 72 byte UTF-8. Password tidak ditampilkan ketika diketik. Username/password ini untuk NEXUS, terpisah dari login Moodle. Aplikasi hanya mengizinkan satu pemilik; pemilik dapat memakai beberapa perangkat.

Jangan menjalankan `db:seed` atau `db:reset` untuk memasang aplikasi pribadi. Kedua command tersebut milik data demo lama.

## 8. Jalankan web/API dan worker

```bash
docker compose up -d --no-build
docker compose ps
curl -fsS http://127.0.0.1:4000/api/health
docker compose logs --tail=50 web worker
```

Kedua container harus `healthy`. Healthcheck tidak membaca database sehingga tidak membangunkan Neon hanya untuk pemeriksaan kesehatan. `restart: unless-stopped` dan Docker systemd membuat layanan kembali hidup sesudah reboot, kecuali sengaja dihentikan operator.

Port container tidak perlu dibuka ke internet. Worker menerima permintaan sync hanya melalui jaringan internal dengan tanda tangan HMAC, dan polling berjalan dalam proses worker setiap seperempat jam: menit 00, 15, 30, 45. Saat dimulai ulang worker langsung meminta pemeriksaan; lease database mencegah dua run untuk akun yang sama berjalan bersamaan.

## 9. Nginx dan HTTPS

```bash
cd /opt/nexus-lms
sed 's/tugas.example.com/tugas.domainmu.com/g' deploy/nginx.conf | sudo tee /etc/nginx/sites-available/nexus-lms
sudo ln -s /etc/nginx/sites-available/nexus-lms /etc/nginx/sites-enabled/nexus-lms
sudo nginx -t
sudo systemctl reload nginx
```

Gunakan nama file dan subdomain yang tidak bertabrakan dengan situs yang sudah ada. Pada server baru, default Nginx boleh tetap ada; `server_name` mengarahkan domain NEXUS ke konfigurasi ini.

Pastikan DNS mengarah ke VPS, lalu minta sertifikat:

```bash
sudo certbot --nginx -d tugas.domainmu.com --redirect
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
curl -fsS https://tugas.domainmu.com/api/health
```

Buka `https://tugas.domainmu.com` di browser. Jangan login melalui IP atau HTTP: produksi memakai cookie `Secure` dan Web Push memerlukan secure context. Periksa `/manifest.webmanifest`, `/sw.js`, dan `/icons/icon-192.png` mengembalikan HTTP 200. File service worker dan HTML memakai `no-cache`; asset dengan nama hash memakai cache panjang. Endpoint `/api` selalu `no-store` dan tidak dicache oleh service worker.

## 10. Hubungkan Moodle dan petakan kelas

1. Masuk menggunakan owner aplikasi yang baru dibuat.
2. Buka **Pengaturan → Koneksi Moodle** dan isi NIM/password kampus.
3. Setelah login Moodle terverifikasi, server menyimpan password dan cookie terenkripsi, lalu meminta sync.
4. Periksa bagian **Whitelist semester**. Kelas tunggal yang cocok dipilih otomatis; jika ada beberapa kandidat, pilih kelas semester sekarang. Kelas yang belum ditemukan tidak memunculkan tugas.
5. Tunggu proses selesai. Periksa waktu terakhir sync, jumlah kelas, dan catatan kegagalan di halaman.
6. Jika ada MFA, CAPTCHA, password salah, atau format login berubah, status meminta hubungkan ulang. Aplikasi tidak mencoba melewati verifikasi tambahan.

Whitelist tetap:

| Kode | Mata kuliah |
| --- | --- |
| SIN504 | Data Warehouse |
| SIN502 | Sistem Informasi Geografis |
| SIN508 | Penjaminan Kualitas Perangkat Lunak |
| SIN303 | Pemrograman Web II |
| SIN304 | Praktikum Pemrograman Web II |
| SIN501 | Kecerdasan Buatan |
| SIN506 | Etika Profesi |
| SIN507 | Statistika |
| SIN505 | Arsitektur Enterprise |

Pencocokan memakai kode SIN eksplisit atau nama yang dinormalisasi, termasuk `Web 2` dan awalan cohort `SI2024`. Kode mata kuliah lain tetap ditolak meski judulnya mirip. Halaman tugas dibaca hanya dari kelas whitelist yang sudah dipilih.

## 11. Instal PWA dan Web Push pada Android

1. Buka alamat HTTPS di **Chrome Android**.
2. Login dan tekan **Instal aplikasi** di bagian atas. Jika prompt belum tersedia, gunakan menu Chrome **⋮ → Instal aplikasi / Tambahkan ke layar utama**. Perilaku tombol mengikuti dukungan browser, lihat [panduan installation prompt](https://web.dev/learn/pwa/installation-prompt).
3. Buka NEXUS dari ikon layar utama.
4. Pengaturan → **Aktifkan notifikasi** → izinkan notifikasi browser/situs dan izin notifikasi Chrome pada Android.
5. Tekan **Tes notifikasi**, lalu periksa panel notifikasi.
6. Tutup webapp dan uji lagi melalui perangkat lain atau saat jadwal pengingat tiba. Web Push dikirim oleh worker VPS; tab tidak perlu tetap terbuka.

Lakukan aktivasi di setiap perangkat. **Nonaktifkan perangkat** menghentikan push perangkat tersebut. Toggle **Pengingat aktif untuk semua perangkat** menjeda seluruh perangkat. Keluar aplikasi mencabut sesi dan langganan perangkat saat ini.

Pengingat berupa **satu ringkasan per perangkat per jam**, pukul **07.00–22.00 WIB**, untuk tugas belum dikumpulkan/draf yang deadline-nya mulai **H-7** hingga tepat **15 hari lewat deadline**. Lebih dari 15 hari masuk arsip. Tugas yang terkumpul berhenti setelah sync berikutnya. Tombol **Sudah diwakili kelompok** mengabaikan tugas secara lokal dan dapat dipulihkan dari tab kelompok.

Tanggal yang tidak terbaca, status tidak dikenal, deadline kosong, hasil tidak terverifikasi, atau hasil yang lebih tua dari 20 menit tidak memicu pengingat. Tugas lama diperiksa ulang dalam siklus arsip paling sering sekali sehari, supaya perubahan deadline masih dapat terdeteksi. Riwayat klaim pengiriman di database mencegah duplikasi setelah restart. Respons push 404/410 menghapus subscription; timeout ambigu tidak dikirim ulang pada jam yang sama.

Notifikasi bisa tertunda oleh jaringan, layanan push, Doze, izin situs, atau pembatasan baterai Android. Jam pengiriman adalah jadwal server; waktu tampil pada perangkat tidak dapat dijamin sampai menit yang sama. Matikan pembatasan baterai Chrome jika perangkat sering menunda notifikasi dan pastikan internet tersedia. Webapp ini bukan APK dan tidak menjalankan alarm native.

## 12. Uji sesudah deployment

| Pemeriksaan | Hasil yang diharapkan |
| --- | --- |
| HTTPS, manifest, SW, ikon | HTTP 200, tidak ada error sertifikat |
| Login lalu reload / tutup buka | Sesi owner bertahan melalui cookie HttpOnly |
| Polling ketika aplikasi ditutup | Waktu sync berubah setiap sekitar 15 menit |
| Mata kuliah lama | Tidak muncul dalam daftar atau detail API |
| Tugas belum submit, H-7 sampai lewat 15 hari | Termasuk ringkasan pada jam aktif |
| Tugas submitted | Tidak dikirim setelah sync |
| “Sudah diwakili kelompok” → pulihkan | Hilang dari aktif, lalu kembali sesuai deadline |
| Deadline >15 hari, kosong, gagal dibaca | Tidak ada pengingat |
| Dua perangkat | Masing-masing mendapat satu ringkasan per jam |
| Restart worker pada jam yang sama | Tidak ada push ganda |
| Moodle logout/password diganti | Login ulang otomatis atau status perlu login ulang |
| Internet Moodle terputus | Data terakhir ditampilkan dengan peringatan, pengingat ditunda |

Pantau minimal 24 jam dengan Moodle dan Android nyata. Jangan mengubah deadline tugas di Moodle hanya untuk tes. Gunakan tes notifikasi dan, bila perlu, branch terpisah dengan data uji. Implementasi sudah diuji otomatis dengan Moodle tiruan dan PostgreSQL lokal, build PWA, serta migrasi Neon branch asli. Pengiriman push Android nyata, login kampus nyata, dan container pada VPS baru tetap perlu verifikasi di servermu.

Uji reboot ketika tidak sedang menjalankan migrasi:

```bash
sudo reboot
```

Sesudah SSH kembali tersambung:

```bash
cd /opt/nexus-lms
docker compose ps
curl -fsS https://tugas.domainmu.com/api/health
docker stats --no-stream
free -h
df -h
```

Jika container `OOMKilled`, lihat `docker inspect` dan `journalctl -k`. Ukur pemakaian worker selama sync. Dengan batas yang disediakan, web maksimal 256 MB dan worker 384 MB; sisanya untuk OS/Nginx. Jika swap sering penuh atau build gagal karena memori, build image di mesin Linux lain lalu kirim image, atau naikkan VPS ke 2 GB setelah pengukuran.

## 13. Backup database dan rahasia

Cadangkan sebelum migrasi/update besar. `pg_dump` harus seversi atau lebih baru dari server Neon; proyek ini PostgreSQL 18, sehingga contoh memakai image `postgres:18`.

```bash
cd /opt/nexus-lms
umask 077
mkdir -p ~/nexus-backups
backup_path=~/nexus-backups/database-$(date -u +%Y%m%d-%H%M%S).dump
docker run --rm --env-file .env postgres:18 sh -c 'exec pg_dump "$DATABASE_URL_UNPOOLED" --format=custom --no-owner --no-acl' > "$backup_path"
test -s "$backup_path"
```

Simpan konfigurasi/secret secara terenkripsi di tempat terpisah:

```bash
gpg --symmetric --cipher-algo AES256 --output ~/nexus-backups/secrets-$(date -u +%Y%m%d-%H%M%S).gpg .env
```

Salin backup database dan secret terenkripsi ke komputer atau penyimpanan lain, bukan hanya disk VPS. Simpan passphrase GPG terpisah. Dump berisi data pribadi dan subscription push walaupun password Moodle di dalamnya terenkripsi. Jangan commit dump atau secret ke Git.

Untuk restore, buat branch Neon pemulihan dan **database kosong baru** pada branch itu. Simpan URL direct target baru ke `.env.restore` dengan permission 600; file tersebut hanya perlu `DATABASE_URL_UNPOOLED`.

```bash
chmod 600 .env.restore
docker run --rm -i --env-file .env.restore postgres:18 sh -c 'exec pg_restore --no-owner --no-acl --dbname="$DATABASE_URL_UNPOOLED"' < ~/nexus-backups/NAMA_BACKUP.dump
```

Uji hasil restore dengan deployment pengujian terpisah. Setelah benar, hentikan web/worker produksi, ubah dua URL Neon pada `.env`, pulihkan kunci enkripsi/VAPID yang sesuai, lalu jalankan kembali. Hindari `--clean` terhadap database berisi data yang belum dicadangkan.

## 14. Update dan rollback

Pertahankan image lama supaya rollback konkret. Sebelum update, tag image berjalan:

```bash
cd /opt/nexus-lms
docker image tag nexus-lms:local nexus-lms:before-update
```

Jika deployment memakai tag kustom, ganti `local` dengan tag itu. Buat backup, lalu ambil source versi baru dengan `git pull --ff-only` atau arsip source baru. Jangan mengganti `.env` ketika menyalin kode.

```bash
docker compose build web
docker compose run --rm --no-deps web node dist-server/scripts/migrate.js
docker compose up -d --no-build
docker compose ps
curl -fsS https://tugas.domainmu.com/api/health
```

Worker memakai image yang sama dengan web. Setelah image dibangun, Compose memperbarui kedua layanan. HTML dan service worker diperbarui saat browser memuat versi baru; bila ada worker PWA versi lama, tutup semua jendela NEXUS lalu buka kembali. Jangan menghapus kunci untuk menyelesaikan masalah cache.

Rollback kode:

```bash
IMAGE_TAG=before-update docker compose up -d --no-build
```

Jalankan command berikutnya dengan `IMAGE_TAG=before-update` juga, atau simpan `IMAGE_TAG=before-update` pada `.env` agar tag bertahan. Migrasi awal ini menambah tabel sehingga snapshot lama tidak dihapus. Rollback kode tidak otomatis mengembalikan skema/data; perubahan skema yang tidak kompatibel memerlukan restore branch hasil backup. Jangan menghapus tabel baru untuk rollback spontan.

Untuk reset password owner:

```bash
docker compose run --rm --no-deps web node dist-server/scripts/owner.js --reset-password
```

Semua sesi dan subscription push dicabut; login dan aktifkan notifikasi lagi di setiap perangkat.

## 15. Troubleshooting

| Gejala | Pemeriksaan / tindakan |
| --- | --- |
| 502 dari Nginx | `docker compose ps`, health API localhost, log web, `sudo nginx -t` |
| Tidak dapat login | Owner sudah dibuat, username/password aplikasi benar, domain sama dengan `APP_URL`, memakai HTTPS |
| 403 saat menyimpan | Reload untuk mengambil CSRF; jangan akses melalui alias domain/IP; Nginx harus mengirim Host dan X-Forwarded-Proto |
| Kelas tidak ditemukan | Cek nama/kode whitelist dan enrollment akun; halaman Pengaturan menunjukkan kandidat |
| Beberapa kelas mirip | Pilih ID kelas yang benar, lalu sinkronkan ulang |
| Status/tanggal tidak terbaca | Buka tugas di Moodle; jangan menebak dari deskripsi. Parser perlu disesuaikan bila tema/bahasa Moodle berubah |
| “Permintaan disimpan” | Worker belum tersedia; cek container worker dan kesamaan kunci. Jadwal berikutnya membaca koneksi yang tersimpan |
| Perlu hubungkan ulang | Password berubah, MFA/CAPTCHA, session login berubah, atau kunci enkripsi berbeda |
| Instal tidak muncul | HTTPS, Chrome Android, manifest/SW/ikon 200; gunakan menu Chrome, periksa apakah sudah terpasang |
| Push tidak tampil | Tes notifikasi, izin Chrome Android/situs, VAPID cocok, internet, pengaturan baterai. Jika subscription kedaluwarsa, Nonaktifkan perangkat lalu Aktifkan notifikasi untuk membuat langganan baru |
| Push tes bisa, deadline tidak diingatkan | Jam WIB, H-7, status, tanda kelompok, usia data ≤20 menit, toggle global, pemetaan kelas |
| Container restart berulang | Log tanpa membagikan credential; `.env` lengkap, database tersedia, memori cukup |
| Biaya Neon naik | Pantau compute/jatah, autoscaling batas kecil untuk satu akun, hindari tab dashboard terus terbuka. Healthcheck tidak memanggil SQL |

Log aplikasi tidak mencetak password, cookie, URL database, atau payload Axios. Jangan mengirim `.env`, dump, atau raw trace yang memuat header login ke layanan publik. Tugas dikumpulkan lewat tombol **Buka Moodle**.
