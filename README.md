# Astra Legion

Prototype game **MOBA 3D berbasis web** bertema superhero **original** (semua hero, nama, dan
desain buatan sendiri). Satu kode yang sama berjalan sebagai:

- **game web multiplayer**: client Three.js + server Node.js/Socket.IO yang authoritative,
- **game web offline**: simulasi yang sama dijalankan di browser, latihan 3v3 lawan bot,
- **APK Android**: dibungkus dengan Capacitor, dengan kontrol layar sentuh.

## Fitur tahap 1

- 1 map kecil 3 lane (top, mid, bottom) dengan jungle: dinding, pepohonan, dan 6 camp monster.
- 2 tim (Biru vs Merah): base dengan fountain penyembuh, 3 tower per lane, dan 1 core.
  Tower hanya bisa diserang setelah tower di depannya hancur; core terbuka setelah satu lane jebol.
- Minion (3 melee + 1 ranged per lane) muncul tiap 30 detik, berjalan di lane, dan menyerang
  musuh terdekat.
- 3 hero original dengan model low-poly dari bentuk primitif, masing-masing 4 skill (Q/W/E/R):
  - **Volt Titan** (tank): Thunder Slam (stun area), Static Shield, Lightning Charge, Tempest Core.
  - **Nova Striker** (ranged blaster): Photon Beam (energy beam), Pulse Grenade, Blink Thrusters,
    Supernova Lance.
  - **Shadow Fang** (assassin): Shadow Dash, Vanish (invisible), Fan of Blades, Night Execution.
- Kamera MOBA top-down miring: zoom, geser, kunci ke hero.
- Klik kanan untuk bergerak dengan pathfinding A* (jalur dihitung di server).
- HUD: HP, mana, XP, cooldown skill, gold, KDA, skor tim, jam, kill feed, timer respawn, minimap.
- Level 1–15, gold dari last hit minion, kill/assist hero, monster jungle, dan tower.
- Bot AI sederhana mengisi slot kosong, jadi pertandingan selalu 3v3.

## Struktur proyek

```
shared/   data & tipe yang dipakai client dan server: konstanta, layout map, definisi hero, protokol
server/   server Socket.IO + simulasi authoritative (server/src/game/)
client/   client Three.js: render, input, HUD, lapisan jaringan
android-overrides/  kustomisasi proyek Android (disalin ke android/ saat build APK)
scripts/  skrip build untuk Windows
```

Simulasi di `server/src/game/` ditulis tanpa API Node, sehingga mode offline di browser dan APK
mengimpor modul yang sama persis dengan yang dijalankan server.

## Menjalankan di lokal

Butuh **Node.js 22** atau lebih baru.

```bash
npm install
npm run dev
```

Buka <http://localhost:5173>. Server game berjalan di port 3000 dan Vite meneruskan koneksi
Socket.IO ke sana. Untuk mencoba multiplayer, buka beberapa tab atau perangkat lain di jaringan
yang sama (`http://IP-komputer:5173`).

Perintah lain:

| Perintah | Fungsi |
| --- | --- |
| `npm run build` | build client ke `dist/client` dan server ke `dist/server/index.cjs` |
| `npm start` | jalankan server hasil build (menyajikan client juga) di port 3000 |
| `npm run typecheck` | cek tipe TypeScript untuk server, shared, dan client |
| `npm run sim -- 30` | uji simulasi: pertandingan bot lawan bot tanpa jaringan, maksimal 30 menit game |

## Kontrol

| Aksi | Mouse & keyboard | Layar sentuh |
| --- | --- | --- |
| Bergerak / menyerang | klik kanan tanah / musuh (tahan untuk terus bergerak) | ketuk tanah / musuh |
| Skill | `Q` `W` `E` `R` ke arah kursor | tombol skill (bidik otomatis ke musuh terdekat) |
| Zoom | scroll | cubit dua jari |
| Geser kamera | kursor di tepi layar, tombol panah, atau seret tombol tengah | seret satu jari |
| Kembali ke hero | tahan `Spasi` | tombol ◎ |
| Kunci kamera ke hero | `Y` atau tombol ◎ | tombol ◎ |
| Berhenti | `S` | – |
| Pindah kamera cepat | klik minimap | ketuk minimap |

Skill `R` terbuka di level 4.

## Mode online dan offline

Saat dibuka, client mencoba menyambung ke server Socket.IO di alamat yang sama dengan halaman.
Jika tidak ada server (misalnya game ditaruh di hosting statis, atau di dalam APK), client
otomatis beralih ke **mode offline**: simulasi dijalankan di perangkat dan kamu bermain 3v3
bersama dan melawan bot.

Untuk menyambung ke server di tempat lain, isi "Alamat server multiplayer" di lobby, atau buka
halaman dengan `?server=http://alamat:3000`.

## Deploy

**Hosting statis** (Apache, Nginx, GitHub Pages, shared hosting): unggah isi `dist/client`.
Semua path relatif, jadi boleh ditaruh di subfolder. Di sini game berjalan dalam mode offline.
Build sengaja dipecah menjadi puluhan file kecil (masing-masing di bawah 50 KB), karena unggahan
file besar lewat drive WebDAV sering macet; batasnya bisa diubah di `client/vite.config.ts`.

**Server multiplayer**: jalankan `npm run build && npm start` di mesin yang bisa menjalankan
Node.js. Variabel lingkungan:

| Variabel | Default | Fungsi |
| --- | --- | --- |
| `PORT` | `3000` | port HTTP |
| `BASE_PATH` | kosong | prefix URL jika server berada di belakang reverse proxy, mis. `/game` |
| `CLIENT_DIR` | `dist/client` | folder client yang disajikan |

Reverse proxy harus meneruskan WebSocket (`Upgrade`/`Connection`) untuk path `socket.io`.

**Docker**:

```bash
docker build -t astra-legion .
docker run -p 3000:3000 astra-legion
```

## APK Android

Butuh **JDK 21**, **Android SDK** (platform 36), dan variabel `ANDROID_HOME`. Memasang Android
Studio versi terbaru sudah mencakup semuanya.

Di Windows:

```bat
.\build.cmd -Apk
```

Skrip ini mem-build client, membuat proyek Android dengan Capacitor di folder `android/`
(tidak ikut git), menerapkan `android-overrides/` (layar penuh, landscape, layar tetap menyala),
lalu menjalankan Gradle. Hasilnya `astra-legion.apk` di root repo; salin ke HP dan pasang
(izinkan "pasang dari sumber tidak dikenal").

Secara manual di sistem lain:

```bash
npm run build:client
npx cap add android      # sekali saja
npx cap sync android
cd android && ./gradlew assembleDebug
```

APK berjalan dalam mode offline. Untuk multiplayer dari HP, jalankan server di komputer
(`npm run dev` atau `npm start`), sambungkan HP ke Wi-Fi yang sama, lalu isi alamat server di
lobby, misalnya `http://192.168.1.10:3000`.

### `build.cmd` (Windows)

| Perintah | Fungsi |
| --- | --- |
| `.\build.cmd` | build web; jika `publishDir` diatur, unggah hasilnya ke folder hosting |
| `.\build.cmd -Apk` | seperti di atas, ditambah build APK |
| `.\build.cmd -Check` | typecheck + uji simulasi |
| `.\build.cmd -Dev` | mode dev |
| `.\build.cmd -Server` | build lalu jalankan server produksi |
| `.\build.cmd -NoPublish` | build tanpa menyentuh folder hosting |

Untuk publikasi otomatis ke hosting yang di-mount sebagai drive (WebDAV/FTP), salin
`build.local.example.json` menjadi `build.local.json` (tidak ikut git) dan isi:

| Kunci | Fungsi |
| --- | --- |
| `publishDir` | folder hosting tujuan; hanya `index.html` dan `assets/` yang diunggah |
| `publishUrl` | alamat publiknya; setelah unggah, skrip memeriksa bahwa build terbaru sudah tersaji |
| `publishApk` | `true` untuk ikut mengunggah `astra-legion.apk` (file beberapa MB) |
| `apkUrl` | alamat unduhan APK untuk tombol "Unduh APK Android" di lobby versi web |

Unggahan dilakukan per file: aset yang sudah ada dilewati, `index.html` diunggah terakhir, dan
aset lama dihapus. Jalankan build dari disk lokal, bukan dari drive jaringan.

## Menambah hero baru

1. **Data**: tambahkan `HeroDef` di [shared/src/heroes.ts](shared/src/heroes.ts) (stat dan 4 skill).
2. **Efek skill**: tulis handler di `server/src/game/skills/` lalu daftarkan di
   [server/src/game/skills/index.ts](server/src/game/skills/index.ts). Key handler = `id` skill.
3. **Model 3D**: tambahkan fungsi builder di
   [client/src/render/heroModels.ts](client/src/render/heroModels.ts) dengan key = `id` hero.

Hero baru langsung muncul di lobby, dan bot bisa memakainya lewat petunjuk `ai` di tiap skill.

## Cara kerja jaringan

- Server menjalankan simulasi 20 tick per detik dan mengirim snapshot ke tiap pemain.
- Client hanya mengirim **perintah** (`move`, `attack`, `cast`, `stop`). Cooldown, mana, jarak
  skill, level ultimate, dan jalur gerak semuanya divalidasi di server.
- Data statis entity dikirim sekali saat entity pertama kali terlihat; data dinamis dikirim
  sebagai tuple ringkas tiap tick.
- Hero musuh yang sedang invisible tidak dikirim sama sekali ke tim lawan.
- Client menghaluskan posisi antar snapshot (interpolasi).

## Batasan tahap ini

Belum ada: beberapa room/matchmaking, client-side prediction, reconnect otomatis, item shop,
fog of war, suara, dan hero tambahan. Dockerfile belum diuji di mesin pengembangan.
