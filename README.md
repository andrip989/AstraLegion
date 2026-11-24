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
- 6 hero original dengan model low-poly dari bentuk primitif, masing-masing 4 skill (Q/W/E/R):
  - **Volt Titan** (tank): Thunder Slam (stun area), Static Shield, Lightning Charge, Tempest Core.
  - **Nova Striker** (ranged blaster): Photon Beam (energy beam), Pulse Grenade, Blink Thrusters,
    Supernova Lance.
  - **Shadow Fang** (assassin): Shadow Dash, Vanish (invisible), Fan of Blades, Night Execution.
  - **Lumen Sage** (support): Radiant Orb (slow area), Healing Light (menyembuhkan kawan), Binding
    Rays (stun garis), Sanctuary (heal besar + damage area).
  - **Ember Lancer** (fighter): Flame Thrust (tusukan garis + slow), Ember Guard (perisai +
    semburan api), Blazing Leap (lompat + slow area), Inferno Cyclone (pusaran api 3 detik yang
    mengikuti hero).
  - **Gale Archer** (marksman / penembak jitu): Gale Piercer (panah angin menembus satu garis),
    Slipstream (melesat + pusaran angin yang memperlambat), Squall Stance (4 detik menyerang lebih
    cepat), Typhoon Volley (3 gelombang panah jarak jauh dengan garis peringatan).
- Karakter beranimasi prosedural (kaki melangkah, siku menekuk, serangan, casting, tumbang saat
  tewas) dan arena yang detail: tebing batu berlumut, hutan cemara & pohon rindang, jalan batu,
  jalan setapak jungle, reruntuhan kuno, jamur & kristal berpendar, lampu jalan, panji tim, dan
  kunang-kunang. Semua tekstur dan model dibuat prosedural, tanpa file gambar (lihat
  [Grafik](#grafik)).
- Kamera MOBA top-down miring: zoom, geser, kunci ke hero.
- Klik kanan untuk bergerak dengan pathfinding A* (jalur dihitung di server).
- HUD: HP, mana, XP, cooldown skill, gold, KDA, skor tim, jam, kill feed, timer respawn, minimap.
- Level 1–15, gold dari last hit minion, kill/assist hero, monster jungle, dan tower.
- **Toko item**: 10 item (damage, HP, kecepatan, cooldown, lifesteal, dsb.), maksimal 6 per hero.
  Membeli bisa di mana saja; menjual (separuh harga) hanya di base atau saat menunggu bangkit.
- **Beli-cepat rekomendasi**: tiap hero punya urutan belanja yang disarankan. Item berikutnya
  selalu tampil di kartu **Rekomendasi** beserta kekurangan emasnya; begitu emas cukup kartu itu
  menyala (dan disorot lagi tiap naik level), lalu satu klik atau tombol `G` langsung membelinya.
  Bot berbelanja dengan urutan yang sama.
- **Dua berkah hutan**: dua golem besar di sumbu tengah peta memberi berkah berbeda kepada hero
  yang menghabisinya. Golem Rimba (sarang atas): **Berkah Golem**, +20% damage selama 75 detik.
  Golem Arus (sarang bawah): **Berkah Arus**, mana pulih jauh lebih cepat dan cooldown skill
  berjalan 25% lebih cepat selama 75 detik. Berkah yang dibawa tampil sebagai chip berhitung
  mundur di atas panel hero.
- **Titan Astra (boss objektif)**: bangkit di menit ke-4, bergantian di dua sarang golem itu
  (golemnya menyingkir selagi Titan ada), dan bangkit lagi 4 menit setelah tumbang. Diumumkan 30
  detik sebelumnya, ada hitung mundurnya di samping jam. Titan menyerang hero terdekat di
  arenanya dan sesekali menghantam tanah: lingkaran peringatan muncul lebih dulu, jadi bisa
  dihindari. Dari luar arenanya ia tidak bisa dilukai. Tim yang menumbangkannya mendapat emas
  dan XP untuk semua hero, **Berkah Titan** (+15% damage, +15% lagi ke tower dan core, 75 detik,
  hilang bila tumbang), dan satu **Raksasa Astra** yang mendorong lane dengan pertahanan lawan
  paling tipis. Bot ikut menyerang Titan bila ada kawan yang sudah bertarung dengannya atau
  timnya unggul jumlah. Angkanya di `TITAN_*` ([shared/src/constants.ts](shared/src/constants.ts)),
  sarangnya `TITAN_PITS` ([shared/src/map.ts](shared/src/map.ts)).
- **Kabut perang dan suar**: sebuah tim hanya melihat lawan dan monster yang berada dalam jarak
  pandang salah satu unitnya (hero, minion, tower, core, suar); tower dan core selalu terlihat.
  Yang tidak terlihat tidak dikirim server ke client itu, tidak bisa dibidik, dan efeknya tidak
  ditampilkan; daerah di luar pandangan digelapkan di arena dan di minimap. Saat malam jarak
  pandang hero menyusut. Tiap hero bisa menanam satu **suar** (tombol `T` / tombol mata): titik
  penglihatan selama 75 detik, tidak terlihat lawan, jeda 50 detik. Aturannya di `VISION` dan
  `visionRadius` ([shared/src/constants.ts](shared/src/constants.ts)), dipakai server dan client.
- **Item aktif**: tiga item punya kemampuan yang dipakai lewat tombol (klik slotnya atau angka
  `1`-`6`): Perisai Aegis (perisai sesaat), Jimat Murni (lepas dari perlambatan dan lumpuh, bisa
  dipakai selagi lumpuh), dan Sangkakala Petir (gelombang damage + perlambatan di sekeliling).
  Sisa jedanya tampil di slot item; bot ikut membeli dan memakainya.
- **Talenta**: satu bonus kecil yang dipilih di lobby (Ganas, Tangguh, Gesit, Cerdik, Haus Darah,
  Pemburu Harta), berlaku sepanjang pertandingan. Daftarnya di
  [shared/src/talents.ts](shared/src/talents.ts); bot memilih acak.
- **Mode Kilat**: pertandingan cepat di peta yang sama, dipilih di lobby oleh pemain pertama di
  room. Hanya lane tengah yang punya tower dan minion, hero mulai di level 3 dengan 400 emas,
  gelombang tiap 20 detik, Titan bangkit di menit ke-2, dan sejak menit 2,5 bangunan makin rapuh.
  Batas waktunya 7 menit (jam menghitung mundur): bila belum ada Core yang hancur, menang tim
  yang towernya lebih utuh, lalu yang kill-nya lebih banyak, lalu yang Core-nya lebih sehat.
  Angkanya di `KILAT` ([shared/src/constants.ts](shared/src/constants.ts)).
- **Menyerah**: setelah menit ke-5, tombol Menyerah di menu pesan cepat membuka pemungutan suara
  30 detik untuk tim sendiri; lolos bila dua pertiga pemain manusia tim itu setuju.
- **Bot pengganti**: pemain yang hero-nya hidup tetapi tidak memberi perintah selama 60 detik
  digantikan bot sampai ia bermain lagi, supaya timnya tidak timpang.
- **Latihan bebas**: tombol di lobby (atau `?latihan` di alamat) memulai pertandingan offline
  dengan panel alat bantu: atur level dan emas, pulihkan dan reset semua jeda, boneka sasaran,
  hentikan bot atau minion, panggil Titan. Hasilnya tidak dicatat ke akun.
- **Tutorial pemain baru**: tombol Tutorial di lobby (disorot bagi yang belum pernah menjalaninya)
  memulai satu pertandingan offline lawan bot Mudah dengan kartu petunjuk yang maju sendiri begitu
  langkahnya dilakukan: bergerak, menyerang, skill, belanja, suar, lalu menghancurkan tower.
  Hasilnya tidak dicatat. Langkah-langkahnya di [client/src/ui/Tutorial.ts](client/src/ui/Tutorial.ts).
- **Ukuran tim**: 3v3 (bawaan), 2v2, atau 1v1, dipilih di lobby oleh pemain pertama di room.
  Tempat yang kosong tetap diisi bot sampai pemain lain masuk, dan Titan Astra lebih ringan di
  room kecil. Bisa digabung dengan mode Kilat.
- **Grafik emas di layar akhir**: emas yang dikumpulkan kedua tim sepanjang pertandingan (satu
  titik tiap 15 detik), dikirim server setelah pertandingan selesai.
- **Lobby bertingkat**: layar pertama adalah masuk/daftar (atau main sebagai tamu), lalu **menu utama** bertombol besar: Main, Latihan & Tutorial, Toko, Profil, Peringkat, Teman, dan Pengaturan. Tombol **Main** membuka layar **Pilih Hero** (kartu hero ringkas, rincian skill hero yang dipilih, lalu pilihan Pertandingan, Perlengkapan, serta Tim & Room) dengan tombol **MULAI** yang selalu terlihat di bawah. **Latihan & Tutorial** punya layarnya sendiri. Esc atau tombol "Menu" kembali ke menu utama; tautan undangan langsung membuka layar Pilih Hero. Perpindahan layarnya di [client/src/ui/menu.ts](client/src/ui/menu.ts).
- **Desain karakter chibi**: semua hero, minion, dan monster bergaya lucu dan imut: kepala besar, mata besar mengilap, pipi merah, badan mungil, dan banyak aksesori kecil. Semuanya tetap dibangun dari kode (bagian-bagian bersama di [client/src/render/cute.ts](client/src/render/cute.ts)); skin tidak mengubah warna kulit wajah.
- **Efek serangan lucu dan percikan darah**: tembakan hero berupa bintang berputar dengan jejak kilau, laser skill ditaburi bintang, pukulan hero kadang memunculkan tulisan komik ("POW!", "BOK!"). Unit yang terkena serangan memercikkan darah bergaya kartun dan meninggalkan genangan kecil yang memudar (monster batu berdarah jingga; bangunan hanya berdebu). Percikan darah bisa dimatikan di Pengaturan.
- **Toko item**: 27 item dalam lima kelompok (Serang, Sihir, Tahan, Gerak, Aktif) plus tab **Saran** berisi urutan rekomendasi untuk hero yang dipakai. Item tampil sebagai kotak ikon kecil bertanda harga; diklik baru muncul rincian lengkapnya (penjelasan, label efek, tombol Beli). Di bawahnya ada **tas** berisi enam slot: klik item di tas untuk menjualnya (separuh harga, di mana saja), atau saat tas penuh pilih **Ganti** lalu item di tas yang ingin ditukar (dijual dan dibeli sekaligus). Efek khusus item baru: **penghisap darah saat membunuh** (Rantai Penghisap, Kalung Kehidupan: HP pulih tiap menumbangkan creep atau monster, tiga kali lipat bila hero), zirah pengurang damage (Rompi Besi, Helm Penjaga), duri pemantul damage (Zirah Duri), serangan kritis (Belati Bintang, Pedang Amarah), serangan memperlambat (Busur Embun), dan skill penghisap darah (Bola Jiwa).
- **Menu admin (selama kamu satu-satunya pemain di room)**: tombol **Admin** berisi Emas maksimal (99.999), HP tak terbatas (hero kebal), dan Sekali pukul (setiap serangan dan skill langsung menumbangkan sasaran). Tampil di pertandingan offline lawan bot, dan juga di pertandingan online selama pemain manusia di room hanya satu (sisanya bot). **Server** yang memeriksa dan menerapkannya (perintah `admin`, ditolak bila ada pemain lain); begitu pemain kedua masuk, menunya hilang dan semua efeknya dimatikan. Pertandingan yang memakai admin **tidak dicatat ke akun** (tanpa XP, koin, poin peringkat, atau misi; `skipped: "admin"`), dan keluar dari pertandingan itu juga tidak dihitung kalah. Tampilannya di [client/src/ui/Admin.ts](client/src/ui/Admin.ts).
- **Bisukan pemain**: tombol Bisukan di papan skor menyembunyikan obrolan, pesan cepat, dan emote
  dari satu pemain di perangkat sendiri (sampai halaman dimuat ulang).
- **Pasang dari browser**: versi web punya manifest dan ikon sendiri
  ([client/public/manifest.json](client/public/manifest.json)), jadi bisa ditaruh di layar utama
  HP ("Tambahkan ke layar utama" / "Install app") dan dibuka layar penuh tanpa APK, termasuk di
  iPhone. Ikonnya dibuat `scripts\make-icons.ps1` dari logo yang sama. File gambar dan manifest
  itu sengaja tidak masuk daftar `version.json`, karena pembaruan di dalam APK mengunduh tiap
  file sebagai teks.
- **Client lama tetap aman**: client menyebut tingkat kemampuannya saat bergabung (`CLIENT_CAPS`);
  server tidak mengirim jenis entity yang belum dikenal client lama (mis. suar).
- **Penyiar pertandingan**: spanduk "Darah Pertama", Double/Triple Kill, kill beruntun, dan tower
  hancur; angka damage untuk seranganmu sendiri dan angka penyembuhan; tepi layar memerah saat
  sekarat.
- Petunjuk singkat langkah demi langkah di pertandingan pertama.
- **Recall**: tekan `B` untuk menyalurkan 4 detik lalu pulang ke base (batal bila bergerak,
  menyerang, atau terkena damage).
- **Akun pemain**: layar masuk/daftar, level akun, statistik, hero favorit, dan riwayat
  pertandingan. Akun disimpan di server game (bisa dipakai di perangkat lain) dan hasil
  pertandingan online dicatat server; saat tidak ada server, dipakai akun di perangkat (lihat
  [Akun](#akun)). Bisa juga main sebagai tamu.
- **Papan peringkat**: tombol **Peringkat** di lobby menampilkan 20 akun online teratas menurut
  XP akun (peringkat, nama, level, menang, jumlah pertandingan) dan baris pemain sendiri.
- **Pengaturan**: kualitas grafik (Ringan / Sedang / Tinggi), volume suara & musik, guncangan
  kamera, penghitung FPS.
- **Suara**: efek serangan, skill, ledakan, dan naik level disintesis di browser, begitu juga
  **musik latar rock** (drum, bass, gitar berdistorsi; lihat
  [client/src/audio/rock.ts](client/src/audio/rock.ts)), jadi tidak ada file musik.
- **Announcer**: setiap hero yang tumbang diumumkan dengan spanduk dan suara ke **semua pemain**:
  First Blood, First/Second Kill, Double sampai Penta Kill (kill beruntun cepat), Killing Spree,
  Rampage, Unstoppable, Dominating, Godlike, Legendary (kill tanpa mati), ditambah Tower
  Destroyed, Victory, dan Defeat. Klip suaranya dibuat dengan `node scripts/make-voice.mjs`
  (TTS bawaan Windows) dan disimpan sebagai modul teks di `client/src/audio/voice/`.
- **Obrolan**: `Enter` untuk tim, `Shift+Enter` untuk semua pemain (atau tombol 💬). Pesan tim
  hanya dikirim server ke pemain setim.
- **Pesan cepat**: tombol 📣 (atau `V`, lalu `1`-`6`) mengirim pesan siap pakai ke tim
  ("Serang!", "Mundur!", "Butuh bantuan!", ...) dan menandai posisi pengirim di minimap dan di
  tanah. Daftarnya ada di `PINGS` ([shared/src/types.ts](shared/src/types.ts)).
- **Room pribadi dan pilihan tim**: di lobby, isi kode room (atau tekan "Undang teman" untuk
  membuat kode dan menyalin tautan `?room=KODE`). Semua yang memakai kode yang sama masuk ke
  pertandingan yang sama, terpisah dari room umum; slot yang kosong tetap diisi bot. Tim bisa
  dipilih (Biru / Merah / otomatis), jadi teman bisa setim atau saling berhadapan. Room pribadi
  dibuat saat pemain pertama masuk dan dihapus begitu kosong (maksimal 12 room sekaligus).
- **Sambung ulang otomatis**: bila koneksi putus di tengah pertandingan (sinyal HP hilang,
  aplikasi ke latar belakang), server menahan hero-nya 60 detik (hero itu pulang ke base) dan
  client menyambung lagi sendiri ke hero yang sama, dengan level, emas, dan item utuh. Baru
  setelah 60 detik slotnya diambil alih bot. Keluar dengan sengaja tidak ditahan.
- **Mantra tempur**: satu kemampuan tambahan yang dipilih di lobby, tanpa mana tetapi
  ber-cooldown panjang: Kilat (pindah seketika 6 unit), Pulih (HP untuk diri dan kawan di dekat),
  Pacu (lari lebih cepat). Tombol `F`, atau tombol bundar di busur luar pada layar sentuh.
  Definisinya di [shared/src/spells.ts](shared/src/spells.ts).
- **Semak persembunyian**: sepuluh semak lebat di tepi lane. Hero di dalamnya tidak terlihat dan
  tidak bisa dijadikan sasaran serangan biasa oleh lawan di luar semak, sampai ia menyerang atau
  memakai skill, lawan ikut masuk ke semak yang sama, atau ada unit lawan yang sangat dekat.
  Skill area tetap mengenainya. Letaknya di `BUSHES` ([shared/src/map.ts](shared/src/map.ts)).
- **Misi harian dan pencapaian**: tiap hari tiga misi (mis. "Kumpulkan 5 kill") dengan bonus XP
  akun, dan sepuluh pencapaian permanen. Terlihat di profil, di lobby, dan di layar akhir
  pertandingan. Hanya untuk akun yang masuk; logikanya di
  [shared/src/progress.ts](shared/src/progress.ts) (dipakai client dan server).
- **Skin warna hero**: tiap hero punya tiga skin (Asli, Fajar, Malam) yang terbuka di level akun
  1, 3, dan 6, dipilih lewat chip di kartu hero. Skin hanya menggeser warna model
  (`applySkin` di [client/src/render/models.ts](client/src/render/models.ts)); daftarnya di
  `SKINS` ([shared/src/skins.ts](shared/src/skins.ts)).
- **Tingkat kesulitan bot**: Mudah / Normal / Sulit di lobby (`BOT_LEVELS`): mengatur kecepatan
  reaksi bot, kapan ia mundur, seberapa sering memakai skill, dan damage-nya ke hero. Ditentukan
  pemain pertama yang masuk room.
- **Layar tumbang**: menampilkan siapa yang menumbangkanmu, **rekap damage** (empat sumber damage
  terbesar dalam 10 detik terakhir: hero lawan per nama, lalu Tower / Minion / Monster), dan kamera
  mengikuti kawan yang masih hidup (ketuk tombolnya untuk pindah ke kawan lain) sampai kamu
  bangkit. Rekapnya dihitung server dan hanya dikirim ke pemilik hero (event `recap`).
- **Minion super**: begitu tower terdalam lawan di sebuah lane hancur, tiap gelombang di lane itu
  membawa satu minion super (HP 2,8 kali dan damage 2,2 kali minion biasa, tampil lebih besar di
  arena dan di minimap), supaya lane yang terbuka terus menekan base lawan. Diumumkan sekali per
  lane; logikanya di `spawnWave` ([server/src/game/Game.ts](server/src/game/Game.ts)).
- **Jangkauan dan peringatan tower**: saat hero mendekati tower lawan, lingkaran jangkauan
  tembaknya muncul di tanah (kuning di luar jangkauan, merah di dalam), dan tanda
  "Tower membidikmu!" tampil begitu tower itu menembakmu.
- **Bangunan diserang**: tim pemilik dikabari ("Tower kita diserang!" / "Core kita diserang!")
  dengan tanda merah di minimap saat hero lawan memukul tower atau core terkena serangan apa pun.
  Dibatasi per bangunan dan per tim supaya tidak membanjir (event `alert`).
- **Siklus siang dan malam**: tiap 8 menit waktu pertandingan berputar siang, senja, malam, fajar
  (`DAY_CYCLE` dan `dayPhase` di [shared/src/constants.ts](shared/src/constants.ts)); warna dan
  kuat cahaya serta kabut ikut berubah ([client/src/render/daylight.ts](client/src/render/daylight.ts)),
  dan jam di atas menampilkan ikon fasenya. Saat **malam**, monster hutan memberi emas 30% lebih
  banyak (`NIGHT_JUNGLE_GOLD`). Arah matahari sengaja tetap supaya bayangan tidak berkedip.
- **Kembali ke lobby**: tombol di layar akhir pertandingan dan di Pengaturan, untuk ganti hero,
  skin, mantra, atau room tanpa memuat ulang sendiri.
- **Emote**: enam emote di menu 📣 muncul di atas kepala hero dan terlihat semua pemain.
- **Info jaringan**: pojok kanan atas menampilkan kode room dan latensi ke server (ms); lobby
  menampilkan jumlah pemain yang sedang bermain.
- **Shut Down dan Wiped Out**: menumbangkan hero yang sedang mengamuk (3 kill atau lebih tanpa
  mati) memberi emas tambahan 60 per kill streak-nya; saat seluruh hero satu tim tumbang
  bersamaan, itu diumumkan ke semua pemain.
- **Papan skor dan MVP**: papan skor menampilkan damage ke hero lawan dan emas tiap pemain; layar
  akhir pertandingan menampilkan kedua tim dan MVP tim pemenang (kill ×3 + assist ×1,5 − mati
  ×1,2 + damage / 400).
- Papan skor (tahan `Tab`) dan ringkasan di akhir pertandingan.
- Bot AI sederhana mengisi slot kosong (memilih hero acak yang belum dipakai timnya), jadi pertandingan selalu 3v3.

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
| `npm run balance -- 60 20` | uji keseimbangan: 60 pertandingan bot (maks. 20 menit), lalu tabel menang / KDA / damage per hero |
| `npm run build:host` | server mandiri untuk web hosting ke `dist/host` (lihat [Deploy](#deploy)) |
| `npm start` | jalankan server hasil build (menyajikan client juga) di port 3000 |
| `npm run typecheck` | cek tipe TypeScript untuk server, shared, dan client |
| `npm run sim -- 30` | uji simulasi: pertandingan bot lawan bot tanpa jaringan, maksimal 30 menit game |

## Kontrol

| Aksi | Mouse & keyboard | Layar sentuh |
| --- | --- | --- |
| Bergerak | klik kanan tanah (tahan untuk terus bergerak) | joystick di kiri bawah |
| Menyerang | klik kanan musuh | tombol pedang (musuh terdekat; tahan untuk terus menyerang), atau ketuk musuh tertentu |
| Skill | `Q` `W` `E` `R` ke arah kursor | ketuk tombol skill (bidik otomatis ke musuh terdekat), atau tahan dan seret untuk membidik sendiri; lepas di tombol Batal untuk mengurungkan |
| Mantra tempur | `F` ke arah kursor | tombol bundar di atas skill (ke arah joystick / arah hadap) |
| Suar penglihatan | `T` di posisi kursor | tombol mata di kiri busur skill (beberapa langkah di depan hero) |
| Item aktif | klik slot item, atau `1`-`6` sesuai nomor slotnya | ketuk slot item |
| Menyerah | `V`, lalu tombol Menyerah (ketuk dua kali) | tombol 📣, lalu Menyerah |
| Pesan cepat ke tim / emote | `V`, lalu `1`-`6` untuk pesan atau klik emote | tombol 📣 |
| Tandai titik di peta | klik kanan minimap, atau `Alt`+klik di arena, lalu pilih pesannya | tekan lama minimap, lalu pilih pesannya |
| Pulang ke base (recall) | `B` | tombol rumah |
| Beli item rekomendasi | `G` atau klik kartu Rekomendasi | ketuk kartu Rekomendasi |
| Toko | `P` | tombol keranjang |
| Papan skor | tahan `Tab` | tombol ☰ |
| Obrolan tim / semua pemain | `Enter` / `Shift+Enter`; di kotak tulis `Tab` ganti tujuan, `Esc` batal | tombol 💬, lalu tombol Tim/Semua |
| Pengaturan | `Esc` | tombol ⚙ |
| Zoom | scroll | cubit dua jari |
| Geser kamera | kursor di tepi layar, tombol panah, atau seret tombol tengah | seret satu jari |
| Kembali ke hero | tahan `Spasi` | tombol ◎ |
| Kunci kamera ke hero | `Y` atau tombol ◎ | tombol ◎ |
| Berhenti | `S` | – |
| Pindah kamera cepat | klik minimap | ketuk minimap |

Skill `R` terbuka di level 4.

**Tata letak layar sentuh.** Joystick di kiri bawah (alasnya pindah ke titik sentuh di dalam
zona kiri bawah), tombol serang besar di kanan bawah dengan empat skill melingkar di sekitarnya,
dan di tengah bawah emas / KDA / wave, toko, recall, serta item. Panel status (potret, HP, mana)
tidak ditampilkan di layar sentuh: HP dan mana hero sendiri ada di atas kepalanya. Tombol serang
memilih hero musuh terdekat lebih dulu, lalu minion atau monster, lalu bangunan. Ketukan di tanah
tidak menggerakkan hero. Elemen dan sentuhannya ada di
[client/src/input/TouchPad.ts](client/src/input/TouchPad.ts), artinya di
[client/src/input/Controls.ts](client/src/input/Controls.ts) (`setStick`, `setAttack`), dan
posisinya di blok "kontrol layar sentuh" [client/src/ui.css](client/src/ui.css).

## Grafik

Semua aset visual dibuat oleh kode saat game dimulai, jadi hasil build tetap kecil:

- **Tekstur** (`client/src/render/textures.ts`): rumput, tanah, batu jalan, dan batu tebing
  digambar ke canvas dari noise, lengkap dengan peta normal.
- **Tanah** (`terrain.ts`): satu bidang dengan shader "splat" yang mencampur tekstur berulang
  menurut peta topeng dari layout map (lane, pelataran, camp, jalan setapak).
- **Map** (`MapView.ts`, `cliffs.ts`, `foliage.ts`, `props.ts`): tebing, pepohonan, tanaman kecil,
  dan properti digambar dengan instancing, jadi ribuan objek hanya butuh puluhan draw call.
- **Unit** (`heroModels.ts`, `creatures.ts`, `buildings.ts`): model dirakit dari bentuk primitif
  menjadi geometri gabungan berwarna per-vertex.
- **Efek** (`Effects.ts`, `particles.ts`): proyektil, tebasan, sinar, gelombang kejut, petir,
  percikan, dan asap.
- **Pencahayaan** (`SceneManager.ts`, `PostFx.ts`): environment map prosedural, bayangan yang
  mengikuti kamera, bloom, tone mapping ACES, dan gradasi warna.

Kualitas dipilih di jendela **Pengaturan** (tombol ⚙ di lobby atau `Esc` saat bermain; tersimpan
di perangkat). Mengubahnya di tengah pertandingan berlaku setelah halaman dimuat ulang.

| Kualitas | Isi | Default |
| --- | --- | --- |
| **Ringan** | bayangan bulat sederhana, tanpa post-processing, objek hiasan dikurangi | layar sentuh / APK |
| **Sedang** | shadow map 2K, bloom + gradasi warna, peta normal tanah, bayangan awan, kolam | GPU terintegrasi |
| **Tinggi** | semua di atas + ambient occlusion, bayangan 4K, tekstur 2× lebih tajam, penajaman gambar, rumput ~3× lebih rapat, rumput tinggi, kerikil, serasah daun, kupu-kupu & daun berguguran, pohon lebih detail, cahaya dinamis dari efek skill | kartu grafis diskret |

Untuk mencoba cepat: tambahkan `?gfx=low`, `?gfx=medium`, atau `?gfx=high` di alamat halaman.
**Di HP dan tablet** (layar sentuh) tingkatnya lebih ringan, karena GPU-nya jauh lebih lemah:
"Tinggi" di sana berarti isi dunia tingkat Sedang dengan gambar lebih tajam (tanpa ambient
occlusion, bayangan 4K, atau kerapatan tanaman tingkat Tinggi); bayangan memakai peta 1K, buffer
efek tanpa MSAA, dan jumlah piksel yang dirender dibatasi 0,8 / 1,05 / 1,4 juta untuk Ringan /
Sedang / Tinggi.

**Pengatur otomatis** (`SceneManager.govern`): tiap 1,5 detik, bila frame rate di bawah sasaran
(42 fps di HP, 38 di komputer), game mematikan ambient occlusion, lalu menurunkan resolusi render
(sampai 50% di HP). Bila itu belum cukup dan masih di bawah 30 fps, efek cahaya (bloom) lalu
bayangan dilepas, dengan pemberitahuan singkat di layar. Hasilnya disimpan di perangkat
(`gfx.auto`), jadi sesi berikutnya langsung mulai dari sana; memilih ulang kualitas di Pengaturan
menghapusnya. Resolusi dinaikkan lagi sendiri bila sudah lancar cukup lama.

**Gerak unit** diinterpolasi menurut waktu server (`EntityViews`): posisi ditampilkan 0,1 detik di
belakang dan ditarik lurus di antara dua snapshot yang mengapitnya, sehingga tetap rata walau
snapshot datang tidak teratur (jaringan seluler).

## Akun

Layar pertama adalah **Masuk / Daftar** (atau "Main sebagai tamu"). Akun menyimpan level akun
(XP dari tiap pertandingan), jumlah menang/kalah, KDA, statistik per hero, dan 20 pertandingan
terakhir; semuanya terlihat di jendela **Profil** di lobby. Akun online juga punya **tier
peringkat**, **daftar teman**, **koin** dengan **hadiah harian** dan **toko kosmetik**, **musim
peringkat** dengan **bingkai** dan **gelar**, serta **penguasaan hero** (bagian-bagian di bawah).
Semua itu hanya untuk akun online: tamu dan akun di perangkat mendapat keterangan "hanya untuk
akun online" di tempat fiturnya, bukan angka tiruan.

Ada dua jenis akun, dan layar masuk selalu menyebut mana yang sedang dipakai:

- **Akun online** (lobby tersambung ke server multiplayer): akun disimpan di server game, jadi
  bisa dipakai di perangkat lain dan ikut **papan peringkat** (tombol **Peringkat** di lobby: 20
  akun teratas menurut poin peringkat, lalu XP akun, lengkap dengan tier-nya, ditambah baris
  pemain sendiri). Pemain tetap masuk setelah halaman dimuat ulang lewat token sesi yang disimpan
  perangkat.
- **Akun di perangkat ini** (tidak ada server yang terjangkau, atau servernya versi lama): akun
  dibuat dan disimpan di `localStorage` perangkat itu saja, seperti sebelumnya, dan tidak ikut
  papan peringkat, tidak punya tier, dan tidak punya daftar teman (profil dan layar akhir
  pertandingan mengatakannya, bukan menampilkan tier tiruan). Akun perangkat tidak dipindahkan ke
  server (client tidak boleh mengirim statistiknya sendiri), jadi pemain lama perlu mendaftar
  sekali lagi sebagai akun online; akun perangkatnya tetap ada dan dipakai lagi saat offline.

**Hasil pertandingan online dicatat server, bukan client.** Saat pertandingan di sebuah room
selesai, server memperbarui profil tiap pemain yang masuk akun dari data simulasinya sendiri
(hero, menang/kalah, K/D/A, lama ikut bermain), tepat satu kali per pertandingan, lalu mengabari
client lewat event `acc:match`; layar akhir menampilkan jawaban itu (XP, poin peringkat, misi,
pencapaian). Tidak
ada event untuk mengirim statistik dari client. Rumus XP, level, misi harian, dan pencapaian ada
di [shared/src/account.ts](shared/src/account.ts) dan
[shared/src/progress.ts](shared/src/progress.ts), dipakai client dan server sekaligus. Beberapa
aturan khusus akun online:

- pemain yang baru ikut kurang dari 2 menit saat pertandingan selesai (bergabung menjelang akhir)
  tidak dicatat; lama pertandingan yang dihitung adalah lama pemain itu ikut bermain;
- pemain yang nyaris diam saja tidak mendapat XP maupun kemenangan, dan untuk poin peringkat
  dihitung kalah (seperti keluar). "Ikut bermain" berarti paling sedikit 25 perintah gerak,
  serang, skill, atau item, dan rata-rata 8 per menit selama ia ikut (`actionsNeeded` di
  [shared/src/account.ts](shared/src/account.ts)); tanpa itu papan peringkat bisa diisi dengan
  meninggalkan hero di base, atau kekalahan dihindari dengan diam;
- satu akun hanya bisa bermain di satu tempat pada satu waktu, dan selalu tampil dengan nama akunnya;
- misi harian berganti pukul 00.00 WIB untuk semua pemain (`GAME_DAY_UTC_OFFSET`), di mana pun
  server-nya berada;
- pertandingan **offline** yang dimainkan selagi memakai akun online adalah latihan: tidak
  dicatat, dan layar akhir mengatakannya.

### Tier peringkat

Tiap akun online punya **poin peringkat** (`rp` di profil; bilangan bulat, mulai dari 0, tidak
pernah di bawah 0). Tier ditentukan dari poinnya; tabel dan hitungannya (`RANK_TIERS`, `rankTier`,
`rankChange`) ada di [shared/src/account.ts](shared/src/account.ts), dipakai client dan server.

| Tier | Perunggu | Perak | Emas | Platina | Berlian | Legenda |
| --- | --- | --- | --- | --- | --- | --- |
| Poin minimum | 0 | 100 | 250 | 450 | 700 | 1000 |

Poin hanya berubah saat **server** mencatat pertandingan online (aturan di atas tetap berlaku:
client tidak bisa mengirim apa pun):

- **menang**: +14 / +20 / +28 untuk bot Mudah / Normal / Sulit (tingkat bot room itu), ditambah
  +6 bila tim lawan berisi setidaknya satu pemain manusia saat pertandingan selesai;
- **kalah**: −12;
- pemain manusia di tim lawan hanya dihitung untuk bonus itu bila ia benar-benar ikut bermain;
- mode Kilat bernilai 0,6 kali (menang +8 / +12 / +17, kalah −7), karena pertandingannya singkat;
- ikut kurang dari 2 menit tidak mengubah poin; nyaris diam saja dihitung kalah;
- **keluar dihitung kalah.** Bila kursi sebuah akun dilepas selagi pertandingannya masih berjalan
  (kembali ke lobby, masa tunggu sambung-ulang 60 detik habis, keluar akun, atau akun itu mulai
  bermain di tempat lain) dan pemainnya sudah memenuhi syarat pencatatan (minimal 2 menit dan 25
  perintah), server langsung mencatat kekalahan dengan K/D/A saat itu: −12 poin, tanpa XP dan
  tanpa kemajuan misi, bertanda "Keluar" di riwayat. Akun itu ditandai untuk pertandingan
  tersebut, jadi bila masuk lagi ke pertandingan yang sama (di tim mana pun) hasil akhirnya tidak
  dicatat lagi, dan layar akhir mengatakannya. Menyambung ulang dalam 60 detik dengan sesi yang
  sama bukan keluar. Kursi yang dilepas server sendiri (server dimatikan) tidak dihukum.

Tier tampil sebagai teks dengan lencana kecil berwarna yang digambar CSS (`.tier` di
[client/src/account.css](client/src/account.css); tidak ada file gambar): di papan peringkat, di
profil (poin dan kemajuan ke tier berikutnya), di tombol profil di lobby, di daftar teman, dan di
layar akhir pertandingan (mis. "+20 poin peringkat", "−12", serta baris "Naik tier" / "Turun
tier").

### Daftar teman

Tombol **Teman** di lobby (di samping Peringkat; angkanya = permintaan yang belum dijawab) membuka
daftar teman akun online. Tidak ada pesan bebas di fitur ini: yang berpindah hanya nama akun,
poin peringkat, id gelar, status, dan kode room.

- **Menambah teman** lewat nama akunnya (tanpa membedakan huruf besar/kecil). Itu membuat
  permintaan; pemain satunya **menerima** atau **menolak**, dan kedua pihak bisa **menghapus**
  pertemanan kapan saja. Dua pemain yang saling meminta langsung berteman.
- **Tidak membocorkan nama mana yang terdaftar.** Jawabannya selalu "Permintaan terkirim bila
  nama itu ada", dan nama itu masuk ke daftar "Permintaan terkirim" persis seperti diketik, baik
  akunnya ada maupun tidak. Penolakan tidak dikabarkan ke pengirim (permintaannya tetap tampak
  menunggu sampai ia membatalkannya). Permintaan ke kotak masuk yang sudah penuh juga dijawab sama
  dan tidak diantar.
- **Batas**: 50 teman, 20 permintaan terkirim, dan 20 permintaan masuk per akun.
- **Kehadiran** hanya untuk teman yang sudah saling menerima: offline / di lobby / sedang bermain.
  Server mendorongnya ke teman yang sedang tersambung saat nilainya berubah (tidak ada polling);
  perubahan beruntun digabung, dan "offline" baru dikabarkan setelah 5 detik supaya memuat ulang
  halaman tidak tampak sebagai keluar-masuk.
- **Undang**: mengajak teman yang sedang di lobby ke room pribadi (bila kode room belum diisi,
  lobby membuatkannya). Teman itu melihat "<nama> mengundangmu ke room ABCD" dengan tombol
  **Gabung** (kode room terisi dan langsung bermain dengan hero yang sedang dipilih) dan
  **Tolak**. Undangan hanya dikirim ke teman yang sudah saling menerima; untuk pemain lain server
  menolak tanpa mengirim apa pun, dan client masih memeriksa sekali lagi bahwa pengirimnya ada di
  daftar teman.

### Koin dan hadiah harian

Tiap akun online punya **koin** (`coins` di profil; bilangan bulat, tidak pernah di bawah 0).
Koin hanya ditambah **server**, dari hal yang ia catat sendiri; client tidak punya event untuk
mengirim koin. Tabel dan hitungannya ada di [shared/src/economy.ts](shared/src/economy.ts).

| Sumber | Koin |
| --- | --- |
| Menang pertandingan online yang dicatat | 30 (mode Kilat 18) |
| Kalah pertandingan online yang dicatat | 12 (mode Kilat 7) |
| Tiap misi harian yang tercapai | 15 |
| Hadiah masuk harian | 20, 30, 40, 50, 60, 80, lalu 120 per hari |
| Hadiah akhir musim | menurut tier akhir (lihat di bawah) |

- Pertandingan yang tidak dicatat penuh tidak memberi koin: ikut kurang dari 2 menit, keluar
  sebelum selesai, atau nyaris diam saja (aturan yang sama dengan XP di atas).
- **Hadiah masuk harian** diklaim dengan menekan tombolnya di lobby (di samping misi harian),
  satu kali per hari permainan (berganti pukul 00.00 WIB). Klaim di hari yang berurutan
  menaikkan streak: hari ke-1 sampai ke-7 memberi 20, 30, 40, 50, 60, 80, 120 koin, sesudah itu
  tetap 120 per hari; bila ada satu hari yang terlewat, kembali ke hari ke-1. Hari dan streak
  ditentukan jam server (event `acc:daily` tidak membawa isi apa pun); klaim kedua di hari yang
  sama, atau klaim setelah jam server mundur, dijawab "sudah diklaim" tanpa koin.
- Koin tampil di tombol **Toko** di bilah akun lobby, di profil, dan di layar akhir pertandingan
  ("+30 koin", dan "Koin misi harian +15" bila ada misi yang tercapai).

### Toko kosmetik

Tombol **Toko** di lobby membuka daftar barang yang dibeli dengan koin: mana yang dijual, mana
yang sudah dimiliki, dan skin mana yang sedang dipakai hero terpilih.

| Barang | Harga | Isi |
| --- | --- | --- |
| Skin **Aurora**, skin **Nebula** | 300 koin masing-masing | skin warna premium; berlaku untuk semua hero, seperti skin gratis |
| **Paket emote** | 250 koin | emote ke-7 sampai ke-12 di menu pesan cepat, untuk pertandingan online |

- Membeli lewat event `acc:buy` dengan satu langkah konfirmasi di layar. **Server** yang
  memeriksa barangnya ada, harganya (dari tabel server, bukan dari permintaan), saldo, dan
  kepemilikan. Pemeriksaan dan pemotongan terjadi dalam satu langkah, jadi klik ganda, permintaan
  yang diulang, dan permintaan bersamaan dari beberapa tab tidak bisa memotong dua kali atau
  membuat saldo negatif; membeli barang yang sudah dimiliki dijawab berhasil tanpa memotong apa pun.
- **Skin diperiksa server saat bergabung** (`joinSkin` di
  [server/src/accounts.ts](server/src/accounts.ts)): akun yang meminta skin yang belum ia punya
  (level akun belum cukup, atau skin premium yang belum dibeli) tampil dengan skin asli. Tamu
  tetap bisa memakai skin gratis seperti sebelumnya, tetapi tidak skin premium. Pilihan skin
  sendiri tetap per hero dan disimpan di perangkat (chip di kartu hero, atau tombol **Pakai** di
  toko); chip skin premium yang belum dimiliki menyebut harganya dan membuka toko.
- **Paket emote** sampai ke pertandingan lewat server: saat bergabung server menetapkan jumlah
  emote pemain dari akunnya (`setEmotes`), dan simulasi menolak emote yang tidak dimiliki.
  Jumlah emote yang dikirim client hanya dipakai pertandingan offline di perangkat itu sendiri.
- Gelar dan bingkai **tidak dijual** (lihat di bawah).

### Musim peringkat, bingkai, dan gelar

Satu **musim** adalah satu bulan kalender menurut waktu permainan (WIB); id-nya `YYYY-MM`, dan
namanya tampil di profil dan di papan peringkat ("Musim November 2026"). Hitungannya ada di
[shared/src/season.ts](shared/src/season.ts) dan `rollSeason` di
[shared/src/account.ts](shared/src/account.ts).

- **Penutupan musim.** Pertama kali server menyentuh sebuah akun di musim baru (masuk,
  melanjutkan sesi, mencatat pertandingan, klaim hadiah, toko), musim lamanya ditutup, tepat
  satu kali, juga bila beberapa sambungan akun itu datang bersamaan: tier dan poin akhirnya
  masuk **riwayat musim** di profil (12 musim terakhir), hadiah koin dibayarkan, **bingkai**
  tier itu diberikan, dan poin peringkat dibagi dua (dibulatkan ke bawah).

  | Tier akhir | Perunggu | Perak | Emas | Platina | Berlian | Legenda |
  | --- | --- | --- | --- | --- | --- | --- |
  | Hadiah koin | 0 | 60 | 120 | 200 | 300 | 450 |

- Akun yang melewatkan beberapa musim sekaligus ditutup satu kali saja (musim terakhir yang ia
  ikuti). Papan peringkat dan daftar teman menampilkan akun yang belum ditutup dengan poin yang
  akan ia punya begitu ditutup (setengahnya), supaya poin musim lalu tidak bercampur dengan
  poin musim ini. Bila jam server mundur, tidak ada yang ditutup.
- Pemain melihat ringkasan **"Musim baru"** sekali: tier akhir, hadiah, bingkai, dan poin awal
  musim ini. Server menandai akun yang ringkasannya belum dilihat (`seasonNote`) sampai client
  mengirim `acc:seen`, jadi ringkasannya tidak hilang walau musim ditutup saat pemain sedang
  tidak melihat (mis. oleh pencatatan pertandingan) dan tidak muncul dua kali.
- **Bingkai** adalah cincin berwarna tier di sekeliling lencana level (profil dan tombol profil
  di lobby), digambar CSS. Bingkai bersifat permanen dan tidak dijual; yang pertama didapat
  langsung terpasang, sesudah itu pemain memilih sendiri di profil.
- **Gelar** adalah teks pendek di bawah nama: di profil, di baris papan peringkat, dan di
  daftar teman (tidak tampil di dalam pertandingan). Pemain memilih satu dari yang sudah
  terbuka; tiap gelar terbuka lewat angka yang dicatat server sendiri
  ([shared/src/titles.ts](shared/src/titles.ts)):

  | Gelar | Syarat |
  | --- | --- |
  | Prajurit Astra | menang 5 pertandingan online |
  | Veteran | main 25 pertandingan online |
  | Penakluk Arena | menang 50 pertandingan online |
  | Tak Terbendung | 8 kill dalam satu pertandingan |
  | Pemburu Titan | tim pemain menumbangkan Titan Astra 10 kali (hitungan baru `titans`, dicatat server saat pertandingan selesai) |
  | Si Rajin | hadiah harian 7 hari berturut-turut (streak terpanjang) |
  | Kesatria Emas, Bintang Berlian, Legenda Hidup | pernah mencapai tier itu (poin tertinggi `peak`) |

- Memasang gelar atau bingkai lewat `acc:equip`; server memeriksa gelarnya dikenal dan
  syaratnya terpenuhi, dan bingkainya memang dimiliki. Yang berpindah lewat jaringan hanya id;
  teks gelar selalu diambil client dari tabelnya sendiri.

### Penguasaan hero

Tiap hero punya **tingkat penguasaan** yang dihitung dari statistik per hero yang sudah ada di
profil (tidak ada data baru): poin penguasaan = jumlah main + jumlah menang dengan hero itu,
jadi kemenangan dihitung dua kali. Tingkatnya Pemula (1 poin), Terlatih (8), Mahir (20), Ahli
(45), dan Master (90); hitungannya di [shared/src/mastery.ts](shared/src/mastery.ts). Lencananya
(belah ketupat berangka, digambar CSS) tampil di pojok potret tiap kartu hero di lobby dan di
daftar hero di profil. Karena statistik per hero akun online hanya dicatat server, penguasaan
hanya ditampilkan untuk akun online.

### Penyimpanan dan pengamanan

**Yang disimpan dan pengamanannya** ([server/src/accounts.ts](server/src/accounts.ts)). Per akun
hanya: nama, hash kata sandi, hash token sesi beserta waktu terakhir dipakai, statistik
permainan (termasuk poin peringkat, koin, barang toko, gelar, bingkai, riwayat musim, dan
keadaan hadiah harian), dan daftar teman beserta permintaan pertemanannya (berupa
nama akun). Tidak ada email, alamat IP, atau data perangkat; kehadiran teman hanya ada di memori.

- Kata sandi di-hash dengan `scrypt` bergaram (acak per akun) dan dibandingkan dalam waktu tetap;
  kata sandi dan token tidak pernah ditulis ke log atau dikirim balik.
- Token sesi: 32 byte acak; server hanya menyimpan SHA-256-nya, paling banyak 5 per akun, dan
  membuang yang 90 hari tidak dipakai. "Keluar" mencabut tokennya.
- Pembatas laju untuk masuk/daftar: 6 percobaan per menit per sambungan, 20 per 10 menit per
  alamat IP, 5 akun baru per jam per alamat IP, dan nama yang 8 kali gagal masuk dikunci 15 menit.
  Alamat client diambil dari `X-Forwarded-For` (entri paling kanan, yang ditulis proxy hosting)
  atau `X-Real-IP`, dan hanya dipakai di memori. Bila proxy hosting tidak meneruskan alamat client,
  pembatas per alamat dilewati (kalau tidak, semua pemain berbagi satu jatah); pembatas per
  sambungan, per nama, dan batas pendaftaran seluruh server (120 per jam) tetap berlaku.
- Pembatas laju daftar teman: 10 permintaan pertemanan per 10 menit per akun, paling banyak 2
  permintaan yang diantar ke orang yang sama per jam (batal lalu kirim lagi berulang-ulang), satu
  undangan per teman per 10 detik, dan semua event akun dan teman 30 per 10 detik per sambungan.
- Pembatas laju koin dan toko: klaim hadiah, pembelian, dan pemasangan gelar/bingkai dihitung
  bersama, 30 per menit per akun dari semua sambungannya.
- Semua yang diterima client dari server dianggap tidak dipercaya: profil, daftar teman, status,
  dan undangan dibersihkan dulu (`cleanAccount`, `cleanFriendList`, `cleanInvite`: hanya nama akun
  yang sah, angka, status yang dikenal, kode room baku) dan nama dilewatkan fungsi escape sebelum
  masuk HTML. Koin, barang toko, bingkai, gelar, dan riwayat musim ikut dibersihkan di
  `cleanProfile`: angka bulat tak negatif, dan hanya id yang ada di tabel milik game; teks yang
  tampil (nama barang, gelar, tier, musim) selalu berasal dari tabel client sendiri.
- Batas ukuran: nama 3–16 karakter, kata sandi 6–64 karakter, pesan dari client paling besar
  32 KB, dan jumlah akun paling banyak `MAX_ACCOUNTS`.

**File data dan cadangan.** Semua akun ada di satu file JSON, `accounts.json`, di folder
`DATA_DIR`. Bawaannya `<folder kerja>/astra-legion-data`. Di web hosting, pemuat
[server/host/start.cjs](server/host/start.cjs) menyetelnya ke folder di sebelah folder server,
yaitu `/home/<akun>/astra-legion-data`: di luar folder web dan di luar folder deploy server, jadi
tidak bisa diunduh lewat web dan tidak tersentuh saat `.\build.cmd` mengunggah versi baru. Saat
dijalankan dari folder repo, foldernya `astra-legion-data/` (tidak ikut git). File ditulis ulang
paling lambat 1,5 detik setelah ada perubahan, lewat file sementara lalu ganti nama, dan ditulis
juga saat server berhenti.

Bentuk filenya tetap `"v": 1`. Yang ditambahkan untuk tier dan teman: `profile.rp` (poin
peringkat), `rp` dan `left` di tiap entri `profile.history`, dan per akun `friends` (kunci akun
teman, selalu dua arah), `reqOut` (nama yang dikirimi permintaan, seperti diketik), dan `reqIn`
(kunci akun yang permintaannya belum dijawab). File lama dimuat apa adanya: akun yang belum punya
isian itu mulai dari 0 poin dan daftar kosong, dan tidak ada yang dibuang. Saat dimuat, daftar
teman dirapikan (teman harus saling mencantumkan dan akunnya harus ada), jadi file yang diedit
tangan tidak menghasilkan hubungan yang timpang. Server versi lama yang membaca file baru akan
mengabaikan isian itu, dan membuangnya saat menulis ulang.

Yang ditambahkan untuk koin, toko, musim, dan gelar, semuanya di dalam `profile` dan tetap
`"v": 1`: `coins` (koin), `owned` (id barang toko), `title` (id gelar terpasang), `frames` dan
`frame` (bingkai yang dimiliki dan yang terpasang; id tier), `titans` (Titan yang ditumbangkan),
`peak` (poin peringkat tertinggi), `login` (hadiah harian: `day`, `streak`, `best`), `season` (id
musim tempat poin sekarang berada), `seasons` (riwayat musim: `id`, `rp`, `tier`, `coins`), dan
`seasonNote` (musim yang ringkasannya belum dilihat). File yang sudah ada dimuat apa adanya dan
tidak ada yang dibuang: akun lama mulai dengan 0 koin, tanpa barang, gelar, dan bingkai; `peak`
mulai dari poin peringkatnya saat itu; dan `season` diisi musim yang sedang berjalan saat file
itu pertama kali dimuat server versi ini (tidak ada yang ditutup, poin tidak berubah), supaya
akun yang lama tidak masuk pun ikut dibagi dua saat musim berikutnya berganti. Gelar terpasang
yang tidak dikenal atau belum terbuka (file yang diedit tangan) dikosongkan saat dimuat. Sama
seperti di atas, server versi lama yang membaca file ini akan membuang isian tersebut saat
menulis ulang, jadi cadangkan `accounts.json` dulu sebelum kembali ke versi lama.

- **Mencadangkan**: salin `accounts.json` ke tempat lain (boleh selagi server berjalan). Di
  hosting yang di-mount sebagai drive: `copy T:\astra-legion-data\accounts.json D:\cadangan\`.
- **Memulihkan**: hentikan server, taruh salinan itu kembali sebagai `accounts.json`, nyalakan lagi.
- Tiap kali mulai, server menyalin file yang berhasil dibaca ke `accounts.json.bak`. Bila
  `accounts.json` suatu saat tidak terbaca, file itu disisihkan sebagai `accounts.rusak-….json`
  (tidak ditimpa) dan cadangan `.bak` dipakai. Untuk mengosongkan semua akun, hapus keduanya.
- Bila folder data tidak bisa ditulisi, server tetap berjalan tanpa akun online (client memakai
  akun di perangkat); log server menyebutkannya, dan `…/socket.io/health` berisi `"accounts": false`.

| Variabel | Default | Fungsi |
| --- | --- | --- |
| `DATA_DIR` | `<folder kerja>/astra-legion-data` | folder file data akun |
| `MAX_ACCOUNTS` | `2000` | jumlah akun maksimum (file ditulis utuh tiap kali; untuk skala lebih besar pindahkan ke database) |
| `TRUST_PROXY` | otomatis | `1`/`0`: selalu/jangan pernah memakai `X-Forwarded-For`. Otomatis = dipakai bila hosting memberi variabel `IP` atau sambungan datang dari mesin yang sama |

Di Docker, image-nya sudah memakai `DATA_DIR=/data` (milik pengguna `node`); pasang volume di
sana, mis. `-v astra-data:/data`, supaya akun tidak hilang saat container dibuat ulang.

**Di sisi kode.** Seluruh client hanya memakai `accounts` dari
[client/src/account/accounts.ts](client/src/account/accounts.ts), yang meneruskan ke
`ServerAccountStore` ([serverStore.ts](client/src/account/serverStore.ts)) selama lobby tersambung
ke server yang mendukung akun, dan ke `LocalAccountStore` selain itu; keduanya memenuhi antarmuka
`AccountStore` yang sama. Protokolnya (event Socket.IO dengan acknowledgement) didokumentasikan
di [shared/src/account.ts](shared/src/account.ts): `acc:hello`, `acc:register`, `acc:login`,
`acc:resume`, `acc:logout`, `acc:board`, dan `acc:match` dari server. `acc:hello` melaporkan versi
protokol: 2 berarti server punya tier peringkat dan daftar teman; di server versi 1 client
menyembunyikan keduanya. Versi 3 menambah koin, hadiah harian, toko, musim, gelar, dan bingkai:
`acc:daily`, `acc:buy`, `acc:equip`, `acc:seen`, dan dari server `acc:update` (akun berubah lewat
tab atau perangkat lain milik akun yang sama); di server versi 2 client menyembunyikan semuanya
dan menyebutkan bahwa server itu belum mendukungnya.

Koin, toko, musim, gelar, dan penguasaan: tabelnya di
[shared/src/economy.ts](shared/src/economy.ts), [season.ts](shared/src/season.ts),
[titles.ts](shared/src/titles.ts), dan [mastery.ts](shared/src/mastery.ts); keputusannya di
`AccountDb` (`claimDaily`, `buy`, `equip`, `seen`, `joinSkin`, `emotes`) dan `rollSeason`; sisi
client di `accounts` (`claimDaily`, `buy`, `equip`, `economy`), lencananya di
[client/src/account/badges.ts](client/src/account/badges.ts), dan jendelanya `openShop`,
`openSeasonNews`, serta `openProfile` di [client/src/ui/panels.ts](client/src/ui/panels.ts).

Daftar teman: protokolnya di [shared/src/friends.ts](shared/src/friends.ts) (`fr:list`, `fr:add`,
`fr:accept`, `fr:decline`, `fr:cancel`, `fr:remove`, `fr:invite`, dan dari server `fr:update`,
`fr:presence`, `fr:invite`), datanya di `AccountDb` dan kehadirannya di kelas `Social`
([server/src/accounts.ts](server/src/accounts.ts)), sisi client di
[client/src/account/friends.ts](client/src/account/friends.ts) (dipakai lewat `accounts.friends`),
dan jendelanya `openFriends` di [client/src/ui/panels.ts](client/src/ui/panels.ts). Pencatatan
"keluar dihitung kalah" ada di `forfeit` di [server/src/index.ts](server/src/index.ts).

## Mode online dan offline

Saat dibuka, client mencoba menyambung ke server Socket.IO di alamat yang sama dengan halaman.
Jika tidak ada server (misalnya game ditaruh di hosting statis, atau di dalam APK), client
otomatis beralih ke **mode offline**: simulasi dijalankan di perangkat dan kamu bermain 3v3
bersama dan melawan bot.

Untuk menyambung ke server di tempat lain, isi "Alamat server multiplayer" di lobby, atau buka
halaman dengan `?server=http://alamat:3000` (jika alamat itu tidak terjangkau, server bawaan
tetap dicoba). `?offline` memaksa mode offline. Alamatnya boleh memuat subfolder, misalnya
`https://situs.com/game`: Socket.IO dicari di `<alamat>/socket.io/`.

Di dalam APK, alamat bawaannya adalah hosting tempat build dipublikasikan (`publishUrl`), jadi
begitu server multiplayer terpasang di hosting, APK ikut online tanpa pengaturan apa pun.

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
| `IP` | kosong (semua antarmuka) | alamat bind; diisi otomatis oleh hosting seperti alwaysdata |
| `BASE_PATH` | kosong | prefix URL jika server berada di belakang reverse proxy, mis. `/game` |
| `CLIENT_DIR` | `dist/client` | folder client yang disajikan |

Reverse proxy harus meneruskan WebSocket (`Upgrade`/`Connection`) untuk path `socket.io`.
Permintaan Socket.IO dikenali di subfolder mana pun (`/apa/saja/socket.io/`) tanpa `BASE_PATH`;
`BASE_PATH` hanya diperlukan jika server ini juga yang menyajikan file client di subfolder.
`<alamat>/socket.io/health` menjawab JSON berisi id build, jumlah pemain, dan apakah akun online
aktif (`accounts`). Variabel untuk akun (`DATA_DIR` dan lainnya) ada di bagian [Akun](#akun).

### Server multiplayer di web hosting (alwaysdata)

Dengan ini game bisa dimainkan online tanpa komputer sendiri yang menyala. File client tetap
disajikan sebagai file statis seperti biasa; yang ditambahkan hanyalah satu situs bertipe
Node.js yang menangani `…/socket.io`. Jika server itu mati, client tetap jalan dalam mode offline.

1. **Unggah servernya.** Isi `serverDir` di `build.local.json` dengan folder di hosting yang
   berada di luar folder web, misalnya `T:\\astra-legion-server` (di hosting menjadi
   `/home/<akun>/astra-legion-server`), lalu jalankan `.\build.cmd`. `npm run build:host`
   membundel server beserta semua dependensinya (tanpa `node_modules`, jadi tidak perlu
   `npm install` atau SSH di hosting) ke `dist/host`, dipecah menjadi potongan 40 KB supaya
   lolos unggahan WebDAV, dan `start.cjs` menyatukannya kembali saat dijalankan.
2. **Buat situsnya** (sekali saja) di panel alwaysdata, **Web > Sites > Add a site**. Harus
   situs **baru** di samping situs yang sudah ada. Jangan mengedit situs lama menjadi Node.js:
   seluruh alamatnya (halaman utama, PHP, file statis) akan dijawab server game dengan 404.

   | Kolom | Isi |
   | --- | --- |
   | Name | `Astra Legion server` (bebas) |
   | Addresses | alamat game + `/socket.io`, mis. `situs.com/game/RPG/socket.io` |
   | Type | `Node.js` |
   | Command | `node /home/<akun>/astra-legion-server/start.cjs` |
   | Working directory, Environment | kosongkan |
   | Trim path (Advanced) | jangan dicentang |
   | Idle time (Advanced) | biarkan bawaan; `0` jika server tidak boleh pernah ditidurkan |

   Server membaca `IP` dan `PORT` yang diberikan alwaysdata dengan sendirinya. Versi Node.js
   diatur di **Environment > Node.js** (minimal 18).

   Nama host di Addresses harus nama yang **diterima alwaysdata**, bukan selalu yang diketik
   pengunjung. Jika domain sendiri diteruskan lewat proxy yang mengganti header Host (mis.
   Cloudflare ke `<akun>.alwaysdata.net`), pakai `<akun>.alwaysdata.net/game/RPG/socket.io`.
   Nama yang diterima tertulis di awal tiap baris `admin/logs/http/<tahun>/http-<tanggal>.log`.
   Tandanya salah alamat: `…/socket.io/health` dijawab halaman 404 milik Apache dan
   `admin/logs/sites/` tidak mencatat proses `node` dijalankan.
3. **Periksa**: buka `https://situs.com/game/RPG/socket.io/health`, lalu buka gamenya; lobby
   harus menampilkan "Terhubung ke server multiplayer."
4. **Jika domain lewat proxy yang tidak meneruskan WebSocket** (mis. Cloudflare Worker; tandanya
   `health` jalan tetapi sambungan WebSocket dijawab error), isi `serverUrl` di
   `build.local.json` dengan alamat langsung ke hosting, mis.
   `https://<akun>.alwaysdata.net/game/RPG`. Alamat itu ditanam ke build sebagai server bawaan,
   jadi halaman tetap dibuka lewat domain sendiri sedangkan sambungan game langsung ke hosting.
   Tanpa ini client jatuh ke long-polling lewat proxy: lambat, dan tiap pemain mengirim belasan
   permintaan per detik yang cepat menghabiskan kuota harian proxy.

**APK di hosting.** Dengan `publishApk: true`, `.\build.cmd -Apk` ikut mengunggah APK ke `apkDir`
(bawaan: `publishDir`). Jika `serverDir` diisi, APK diunggah berupa potongan 40 KB ke
`<serverDir>\files` dan didaftarkan di `files.json`; `start.cjs` yang berjalan di hosting
menyatukannya ke folder tujuan lalu menghapus potongannya. `apkDir` harus berada di bawah induk
`serverDir` (folder akun hosting). Isi `apkUrl` dengan alamat publiknya supaya lobby versi web
menampilkan tombol unduh dan skrip bisa memeriksa hasilnya.

Pembaruan berikutnya cukup `.\build.cmd`. Server yang sedang berjalan melihat `manifest.json`
yang baru, menunggu sampai tidak ada pemain, lalu berhenti; hosting menyalakannya lagi dengan
build baru pada permintaan berikutnya. Skrip build memeriksa `health` dan melaporkan build mana
yang berjalan. Jika hosting tidak menyalakannya lagi, klik **Restart** pada situsnya.

Hosting menidurkan situs yang lama tidak menerima permintaan (bawaan 30 menit) dan
menyalakannya lagi saat ada yang datang. Selama pertandingan berjalan, client mengirim
permintaan kecil tiap 4 menit supaya server tidak ditidurkan di tengah permainan. Log server
ada di `/home/<akun>/admin/logs/sites/`.

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

APK mencoba server multiplayer di hosting (`publishUrl`) dan beralih ke mode offline jika tidak
ada. Untuk memakai server di komputer sendiri, jalankan `npm run dev` atau `npm start`,
sambungkan HP ke Wi-Fi yang sama, lalu isi alamat server di lobby, misalnya
`http://192.168.1.10:3000`.

## Pembaruan dari layar utama

Setiap build menulis `version.json` (versi + daftar file) ke `dist/client`. Lobby menampilkan
versi yang sedang berjalan dan mengecek `version.json` di hosting; jika ada versi yang lebih
baru, muncul tombol **"Versi baru tersedia · ketuk untuk memperbarui"**.

- **Web**: tombol itu memuat ulang halaman.
- **APK**: file build terbaru diunduh dari hosting ke penyimpanan aplikasi, lalu aplikasi
  berpindah ke versi itu dan mengingatnya untuk peluncuran berikutnya. APK tidak perlu dipasang
  ulang.

Supaya APK tahu ke mana harus mengecek, build APK dengan `publishUrl` terisi di
`build.local.json` (alamat itu disisipkan ke dalam build). Setelah itu, merilis pembaruan cukup
dengan `.\build.cmd`. Perubahan di sisi native (plugin Capacitor, izin, ikon aplikasi, layar
pembuka) tetap membutuhkan APK baru: pembaruan dari layar utama tidak bisa mengganti bagian itu.

Supaya pemain tahu kapan APK-nya perlu dipasang ulang, APK melaporkan **versi cangkangnya** lewat
user agent WebView (`"appendUserAgent": "AstraShell/2"` di
[capacitor.config.json](capacitor.config.json)). Bila angka itu lebih kecil dari yang ada di build
web terbaru (APK lama yang belum melaporkan apa pun dihitung versi 1), lobby di dalam aplikasi
menampilkan ajakan **"Aplikasi versi baru tersedia … ketuk untuk mengunduh APK, lalu pasang"**
yang membuka alamat APK di browser HP. **Naikkan angka `AstraShell/N` tiap kali ikon, layar
pembuka, atau plugin native berubah**, lalu rilis dengan `.\build.cmd -Apk`.

### `build.cmd` (Windows)

| Perintah | Fungsi |
| --- | --- |
| `.\build.cmd` | build web; jika `publishDir` diatur, unggah hasilnya ke folder hosting (dan server multiplayer ke `serverDir`) |
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
| `publishApk` | `true` untuk ikut mengunggah `astra-legion.apk` (file beberapa MB) saat `-Apk` |
| `apkDir` | folder hosting tujuan APK; kosong = `publishDir` |
| `apkUrl` | alamat unduhan APK untuk tombol "Unduh APK Android" di lobby versi web |
| `serverUrl` | alamat server multiplayer bawaan yang ditanam ke build; kosong = alamat halaman itu sendiri |
| `serverDir` | folder di hosting untuk server multiplayer (lihat [Server multiplayer di web hosting](#server-multiplayer-di-web-hosting-alwaysdata)); kosong = tidak diunggah |

Unggahan dilakukan per file: aset yang sudah ada dilewati, `index.html` diunggah terakhir, dan
aset lama dihapus. Jalankan build dari disk lokal, bukan dari drive jaringan.

## Logo dan ikon

Sumber logonya `moba_logo.svg` dan `moba_logo_1024.png` di root repo.

- **Web**: [client/public/logo.svg](client/public/logo.svg) dipakai sebagai ikon tab browser dan
  emblem di layar masuk, lobby, dan layar memuat. Isinya `moba_logo.svg` dengan teks di pitanya
  sudah diubah menjadi bentuk (outline font Impact), supaya tampil sama di perangkat yang tidak
  punya font itu. Formatnya sengaja SVG: kecil (8 KB) dan berupa teks, jadi lolos unggahan WebDAV
  dan ikut terunduh oleh pembaruan di dalam APK (yang mengunduh file sebagai teks; gambar PNG
  akan rusak di jalur itu).
- **Android**: `powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1` membuat ikon
  aplikasi (termasuk ikon adaptif) dan splash screen dari `moba_logo_1024.png` ke
  `android-overrides/`, yang disalin ke proyek Android saat `.\build.cmd -Apk`.

Mengganti logo: timpa kedua file sumber, jalankan `make-icons.ps1`, dan perbarui
`client/public/logo.svg` (kalau SVG baru masih memuat elemen `<text>`, ubah dulu teksnya menjadi
path, atau tampilannya bergantung pada font tiap perangkat).

## Menambah hero baru

1. **Data**: tambahkan `HeroDef` di [shared/src/heroes.ts](shared/src/heroes.ts) (stat dan 4 skill).
2. **Efek skill**: tulis handler di `server/src/game/skills/` lalu daftarkan di
   [server/src/game/skills/index.ts](server/src/game/skills/index.ts). Key handler = `id` skill.
3. **Model 3D**: tambahkan fungsi builder + `look` (sifat bahan & warna nyala) di `HERO_MODELS`
   pada [client/src/render/heroModels.ts](client/src/render/heroModels.ts) dengan key = `id` hero.
4. **Ikon skill** (opsional): tambahkan SVG di [client/src/ui/icons.ts](client/src/ui/icons.ts)
   dengan key = `id` skill; tanpa itu dipakai ikon bintang umum.

Hero baru langsung muncul di lobby (potretnya dirender dari model 3D-nya), dan bot bisa memakainya
lewat petunjuk `ai` di tiap skill.

## Menambah item baru

Tambahkan entri di `ITEMS` pada [shared/src/items.ts](shared/src/items.ts) (harga + bonus stat);
efeknya langsung dihitung server lewat `Hero.recalc`. Selain bonus stat biasa, `ItemStats` punya `armor`, `thorns`, `crit`, `slowHit`, `killHeal`, dan `spellVamp` (dipakai di `Game.damage`, `Game.basicAttack`, dan saat unit tumbang), serta `cat` untuk kelompoknya di toko. Item aktif menambah `active` (jenis dan
jeda); efeknya ada di `useItem` ([server/src/game/heroLogic.ts](server/src/game/heroLogic.ts)) dan
angkanya di `ITEM_ACTIVE`. Ikonnya opsional, di
[client/src/ui/icons.ts](client/src/ui/icons.ts) dengan key = `id` item. Supaya bot membelinya,
tambahkan ke `BUILDS` di [shared/src/items.ts](shared/src/items.ts); urutan itu juga yang dipakai kartu Rekomendasi.

## Cara kerja jaringan

- Server menjalankan simulasi 20 tick per detik dan mengirim snapshot ke tiap pemain.
- Satu `Game` per room ([server/src/index.ts](server/src/index.ts)): room umum (kode kosong) selalu
  ada; room pribadi dibuat dari kode di permintaan `join`. Room tanpa pemain tidak disimulasikan.
- Client hanya mengirim **perintah** (`move`, `attack`, `cast`, `stop`, `buy`, `sell`, `recall`). Cooldown, mana, jarak
  skill, level ultimate, dan jalur gerak semuanya divalidasi di server.
- Data statis entity dikirim sekali saat entity pertama kali terlihat; data dinamis dikirim
  sebagai tuple ringkas tiap tick.
- Hero musuh yang sedang invisible tidak dikirim sama sekali ke tim lawan.
- Client menghaluskan posisi antar snapshot (interpolasi).
- Event `die` memberi tahu client unit mana yang tewas, supaya modelnya bisa tumbang/meledak dulu
  sebelum dihapus. Client tetap berjalan dengan server lama yang belum mengirim event ini (unit
  hanya langsung menghilang seperti sebelumnya).

## Batasan tahap ini

Belum ada: beberapa room/matchmaking, client-side prediction, reconnect otomatis, fog of war,
dan hero tambahan. Akun online belum punya ganti kata sandi, pemulihan kata sandi yang lupa, atau
hapus akun dari dalam game (lihat [Akun](#akun)). Dockerfile belum diuji di mesin pengembangan.
