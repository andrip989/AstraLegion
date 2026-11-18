<#
  Skrip build Astra Legion untuk Windows. Jalankan dari salinan repo di DISK LOKAL
  (bukan drive jaringan/WebDAV: node_modules dan Gradle sangat lambat di sana).

    build.cmd              build web ke dist/client, lalu publikasikan jika publishDir diatur
    build.cmd -Apk         seperti di atas + APK debug Android -> astra-legion.apk
    build.cmd -Check       typecheck + uji simulasi bot-vs-bot
    build.cmd -Dev         mode dev: client http://localhost:5173, server http://localhost:3000
    build.cmd -Server      build lalu jalankan server produksi di http://localhost:3000
    build.cmd -NoPublish   build saja, jangan menyalin apa pun ke publishDir / serverDir

  Publikasi ke web hosting: buat build.local.json (tidak ikut git) di root repo; contohnya ada
  di build.local.example.json. Hanya hasil build (index.html, assets/, astra-legion.apk) yang
  disalin ke publishDir. Jika serverDir diisi, server multiplayer (dist/host) ikut diunggah ke
  sana; lihat README bagian "Server multiplayer di web hosting".
#>
param(
  [switch]$Apk,
  [switch]$Check,
  [switch]$Dev,
  [switch]$Server,
  [switch]$NoPublish,
  [string]$PublishTo
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step([string]$text) { Write-Host "==> $text" -ForegroundColor Cyan }

function Run([string]$what, [scriptblock]$cmd) {
  Step $what
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "$what gagal (exit code $LASTEXITCODE)" }
}

# Salin satu file ke folder hosting. Drive WebDAV kadang putus sesaat ("network path was not
# found"), jadi dicoba ulang beberapa kali sebelum menyerah.
function Copy-ToHost([string]$from, [string]$to) {
  for ($try = 1; ; $try++) {
    try {
      Copy-Item $from $to -Force -ErrorAction Stop
      return
    } catch {
      if ($try -ge 4) { throw }
      Write-Host "    koneksi ke hosting terputus, mencoba lagi ($try/3)..." -ForegroundColor Yellow
      Start-Sleep -Seconds (4 * $try)
    }
  }
}

function Copy-Tree([string]$from, [string]$to) {
  robocopy $from $to /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Gagal menyalin $from -> $to (robocopy $LASTEXITCODE)" }
  $global:LASTEXITCODE = 0
}

# Unggah hasil build web ke folder hosting, file demi file. Folder hosting biasanya drive
# jaringan (WebDAV/FTP) yang lambat, jadi: aset ber-hash yang sudah ada dilewati, index.html
# diunggah paling akhir (situs baru beralih setelah semua chunk siap), lalu aset lama dihapus.
function Publish-Web([string]$from, [string]$to) {
  $assetsFrom = Join-Path $from 'assets'
  $assetsTo = Join-Path $to 'assets'
  if (-not (Test-Path $assetsTo)) { New-Item -ItemType Directory -Force $assetsTo | Out-Null }
  $existing = @{}
  foreach ($f in Get-ChildItem $assetsTo -File -ErrorAction SilentlyContinue) { $existing[$f.Name] = $f.Length }

  $assets = @(Get-ChildItem $assetsFrom -File)
  $todo = @($assets | Where-Object { $existing[$_.Name] -ne $_.Length })
  $big = @($todo | Where-Object { $_.Length -gt 55KB })
  if ($big.Count) { Write-Warning "Ada $($big.Count) file di atas 55 KB; unggahan lewat WebDAV bisa sangat lambat untuk file sebesar itu." }
  Write-Host "  $($assets.Count - $todo.Count) aset sudah ada, $($todo.Count) perlu diunggah"
  $i = 0
  foreach ($f in $todo) {
    $i++
    Write-Host ("  [{0}/{1}] assets\{2} ({3} KB)" -f $i, $todo.Count, $f.Name, [math]::Round($f.Length / 1KB))
    Copy-ToHost $f.FullName (Join-Path $assetsTo $f.Name)
  }
  foreach ($f in Get-ChildItem $from -File) {
    Write-Host "  $($f.Name)"
    Copy-ToHost $f.FullName (Join-Path $to $f.Name)
  }
  $keep = $assets | ForEach-Object { $_.Name }
  foreach ($name in $existing.Keys) {
    if ($keep -notcontains $name) {
      Write-Host "  hapus aset lama: $name"
      Remove-Item (Join-Path $assetsTo $name) -Force -ErrorAction SilentlyContinue
    }
  }
}

# Unggah server multiplayer (dist/host) ke folder di hosting. Potongan bundel dinamai menurut id
# build, jadi yang sudah ada dilewati; manifest.json diunggah paling akhir, dan server yang sedang
# berjalan berganti ke build baru sendiri begitu tidak ada pemain. Mengembalikan id build.
function Publish-Server([string]$from, [string]$to) {
  $partsTo = Join-Path $to 'parts'
  if (-not (Test-Path $partsTo)) { New-Item -ItemType Directory -Force $partsTo | Out-Null }
  $existing = @{}
  foreach ($f in Get-ChildItem $partsTo -File -ErrorAction SilentlyContinue) { $existing[$f.Name] = $f.Length }

  $manifestFrom = Join-Path $from 'manifest.json'
  $manifest = Get-Content $manifestFrom -Raw | ConvertFrom-Json
  $parts = @(Get-ChildItem (Join-Path $from 'parts') -File)
  $todo = @($parts | Where-Object { $existing[$_.Name] -ne $_.Length })
  $i = 0
  foreach ($f in $todo) {
    $i++
    Write-Host ("  [{0}/{1}] parts\{2} ({3} KB)" -f $i, $todo.Count, $f.Name, [math]::Round($f.Length / 1KB))
    Copy-ToHost $f.FullName (Join-Path $partsTo $f.Name)
  }
  foreach ($name in 'start.cjs', 'manifest.json') {
    $src = Join-Path $from $name
    $dst = Join-Path $to $name
    if ((Test-Path $dst) -and (Get-FileHash $src).Hash -eq (Get-FileHash $dst).Hash) { continue }
    Write-Host "  $name"
    Copy-ToHost $src $dst
  }
  if (-not $todo.Count) { Write-Host "  server di hosting sudah build $($manifest.build)" }
  $keep = $parts | ForEach-Object { $_.Name }
  foreach ($name in $existing.Keys) {
    if ($keep -notcontains $name) {
      Write-Host "  hapus potongan lama: $name"
      Remove-Item (Join-Path $partsTo $name) -Force -ErrorAction SilentlyContinue
    }
  }
  return $manifest.build
}

# Unggah satu file besar (mis. APK) lewat server hosting. Drive WebDAV macet untuk file besar,
# jadi file dipecah menjadi potongan kecil di <serverDir>\files dan didaftarkan di files.json;
# pemuat server (start.cjs) yang berjalan di hosting menyatukannya ke $target. $target harus
# berada di bawah induk serverDir (folder akun hosting). Mengembalikan $true jika sudah terpasang.
function Publish-BigFile([string]$file, [string]$serverDir, [string]$target, [string]$wakeUrl, [string]$publicUrl) {
  $partSize = 40000
  $account = (Split-Path -Parent $serverDir).TrimEnd('\')
  if (-not $target.StartsWith($account + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Tujuan $target harus berada di bawah $account\" }
  $to = $target.Substring($account.Length + 1) -replace '\\', '/'
  $bytes = [IO.File]::ReadAllBytes($file)
  $sha = (Get-FileHash $file -Algorithm SHA256).Hash.ToLower()

  $listFile = Join-Path $serverDir 'files.json'
  $remote = $null
  if (Test-Path $listFile) { try { $remote = Get-Content $listFile -Raw | ConvertFrom-Json } catch { } }
  $known = $remote -and @($remote.files | Where-Object { $_.to -eq $to -and $_.sha256 -eq $sha }).Count
  if ($known -and (Test-Path $target) -and (Get-Item $target).Length -eq $bytes.Length) {
    Write-Host "  $to sudah versi ini"
    return $true
  }

  $filesDir = Join-Path $serverDir 'files'
  if (-not (Test-Path $filesDir)) { New-Item -ItemType Directory -Force $filesDir | Out-Null }
  $existing = @{}
  foreach ($f in Get-ChildItem $filesDir -File -ErrorAction SilentlyContinue) { $existing[$f.Name] = $f.Length }
  $count = [int][math]::Ceiling($bytes.Length / $partSize)
  $names = @()
  # Tiap unggahan lewat WebDAV makan beberapa detik berapa pun ukurannya (tertahan latensi, bukan
  # lebar pita), jadi potongan diunggah enam sekaligus. Potongan yang sudah ada dilewati, sehingga
  # unggahan yang terputus bisa dilanjutkan.
  $pool = [runspacefactory]::CreateRunspacePool(1, 6)
  $pool.Open()
  $jobs = @()
  for ($i = 0; $i -lt $count; $i++) {
    $name = '{0}-{1:d3}.part' -f $sha.Substring(0, 12), $i
    $names += $name
    $len = [math]::Min($partSize, $bytes.Length - $i * $partSize)
    if ($existing[$name] -eq $len) { continue }
    $chunk = New-Object byte[] $len
    [Array]::Copy($bytes, $i * $partSize, $chunk, 0, $len)
    $ps = [powershell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript({ param($path, $data) [IO.File]::WriteAllBytes($path, $data) }).AddArgument((Join-Path $filesDir $name)).AddArgument($chunk)
    $jobs += @{ ps = $ps; handle = $ps.BeginInvoke(); name = $name }
  }
  $sent = 0
  try {
    foreach ($job in $jobs) {
      $job.ps.EndInvoke($job.handle)
      if ($job.ps.HadErrors) { throw "Gagal mengunggah potongan $($job.name): $($job.ps.Streams.Error[0])" }
      $sent++
      if ($sent % 30 -eq 0) { Write-Host ("  potongan {0}/{1}" -f $sent, $jobs.Count) }
    }
  } finally {
    foreach ($job in $jobs) { $job.ps.Dispose() }
    $pool.Close()
  }
  Write-Host "  $count potongan ($sent diunggah, sisanya sudah ada)"
  foreach ($name in $existing.Keys) {
    if ($names -notcontains $name) { Remove-Item (Join-Path $filesDir $name) -Force -ErrorAction SilentlyContinue }
  }
  # files.json paling akhir: saat server hosting melihatnya, semua potongan sudah lengkap.
  $entries = @()
  if ($remote) { $entries += @($remote.files | Where-Object { $_.to -ne $to }) }
  $entries += [ordered]@{ to = $to; size = $bytes.Length; sha256 = $sha; parts = $names }
  $json = @{ files = $entries } | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText($listFile, $json, (New-Object Text.UTF8Encoding($false)))

  Write-Host '  menunggu server hosting menyatukan potongan...'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  for ($try = 0; $try -lt 18; $try++) {
    # permintaan ini sekaligus menyalakan server hosting jika sedang tidur
    if ($wakeUrl) { try { Invoke-WebRequest -UseBasicParsing -Uri $wakeUrl -TimeoutSec 20 | Out-Null } catch { } }
    Start-Sleep -Seconds 5
    if ($publicUrl) {
      try {
        # parameter acak supaya yang diperiksa file di hosting, bukan salinan lama di cache CDN
        $probe = $publicUrl + $(if ($publicUrl.Contains('?')) { '&' } else { '?' }) + "t=$([DateTime]::UtcNow.Ticks)"
        $head = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $probe -TimeoutSec 20
        if ([int64]$head.Headers['Content-Length'] -eq $bytes.Length) { return $true }
      } catch { }
    }
    if ((Test-Path $target) -and (Get-Item $target).Length -eq $bytes.Length) { return $true }
  }
  return $false
}

# Cari JDK dengan versi mayor >= $min: ASTRA_JAVA_HOME, JAVA_HOME, lalu lokasi umum.
function Find-Jdk([int]$min) {
  $candidates = @($env:ASTRA_JAVA_HOME, $env:JAVA_HOME)
  foreach ($base in 'C:\Program Files\Android', 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Java', 'C:\Program Files\Microsoft', "$env:USERPROFILE\.jdks") {
    if (-not (Test-Path $base)) { continue }
    foreach ($dir in Get-ChildItem $base -Directory -ErrorAction SilentlyContinue) {
      $candidates += $dir.FullName
      $candidates += (Join-Path $dir.FullName 'jbr') # JDK bawaan Android Studio
    }
  }
  foreach ($c in $candidates) {
    if (-not $c) { continue }
    $release = Join-Path $c 'release'
    if (-not (Test-Path $release) -or -not (Test-Path (Join-Path $c 'bin\java.exe'))) { continue }
    $m = Select-String -Path $release -Pattern 'JAVA_VERSION="(\d+)' | Select-Object -First 1
    if ($m -and [int]$m.Matches[0].Groups[1].Value -ge $min) { return $c.TrimEnd('\') }
  }
  return $null
}

try {
  if (([IO.DriveInfo]::new((Get-Item $root).PSDrive.Root)).DriveType -eq 'Network') {
    Write-Warning 'Repo ini berada di drive jaringan. Build akan sangat lambat; salin/clone repo ke disk lokal.'
  }
} catch { }

# ---------------------------------------------------------------- konfigurasi publikasi
$cfgFile = Join-Path $root 'build.local.json'
$cfg = if (Test-Path $cfgFile) { Get-Content $cfgFile -Raw | ConvertFrom-Json } else { $null }
$publishDir = if ($PublishTo) { $PublishTo } elseif ($cfg -and $cfg.publishDir) { $cfg.publishDir } else { $null }
$publishUrl = if ($cfg -and $cfg.publishUrl) { $cfg.publishUrl } else { $null }
$publishApk = [bool]($cfg -and $cfg.publishApk) # APK berukuran beberapa MB; hanya untuk hosting yang kuat menerima file besar
$doPublish = (-not $NoPublish) -and $publishDir
if ($doPublish -and -not (Test-Path $publishDir)) { throw "publishDir tidak ditemukan: $publishDir" }
# Folder di hosting untuk server multiplayer (di luar folder web), mis. T:\astra-legion-server.
$serverDir = if ($cfg -and $cfg.serverDir) { $cfg.serverDir } else { $null }
$doServer = (-not $NoPublish) -and $serverDir
if ($doServer -and -not (Test-Path (Split-Path -Parent $serverDir))) { throw "Induk serverDir tidak ditemukan: $serverDir" }
$serverBuild = $null
# Alamat server multiplayer yang ditanam ke build. Isi jika server harus dihubungi lewat alamat
# lain dari alamat halaman, mis. domain yang lewat proxy yang tidak meneruskan WebSocket.
# Build untuk dijalankan lokal (-Server, -Dev) tetap memakai server di alamatnya sendiri.
$serverUrl = if ($cfg -and $cfg.serverUrl) { $cfg.serverUrl.TrimEnd('/') } else { $null }
if ($serverUrl -and -not $Server -and -not $Dev) { $env:VITE_SERVER_URL = $serverUrl }
$healthBase = if ($serverUrl) { $serverUrl } elseif ($publishUrl) { $publishUrl.TrimEnd('/') } else { $null }
$healthUrl = if ($healthBase) { "$healthBase/socket.io/health" } else { $null }
# Folder tujuan APK di hosting (bawaan: publishDir) dan alamat publiknya.
$apkDir = if ($cfg -and $cfg.apkDir) { $cfg.apkDir } else { $publishDir }
$apkUrl = if ($cfg -and $cfg.apkUrl) { $cfg.apkUrl } else { $null }
# Alamat hosting disisipkan ke build supaya APK bisa mengecek dan mengunduh versi baru dari sana.
if ($publishUrl) { $env:VITE_UPDATE_URL = $publishUrl }
# Tautan "Unduh APK" di lobby versi web: apkUrl dari konfigurasi, atau file di hosting jika publishApk aktif.
if ($cfg -and $cfg.apkUrl) { $env:VITE_APK_URL = $cfg.apkUrl }
elseif ($publishApk) { $env:VITE_APK_URL = './astra-legion.apk' }

# ---------------------------------------------------------------- dependensi
$stamp = Join-Path $root 'node_modules\.astra-stamp'
# Yang menentukan isi node_modules adalah package-lock.json. Mengubah skrip di package.json tidak
# perlu instal ulang ("npm ci" menghapus node_modules dan gagal jika dev server sedang berjalan).
$lock = Join-Path $root 'package-lock.json'
$hash = (Get-FileHash $(if (Test-Path $lock) { $lock } else { Join-Path $root 'package.json' })).Hash
if (-not (Test-Path $stamp) -or (Get-Content $stamp -Raw).Trim() -ne $hash) {
  if (Test-Path (Join-Path $root 'package-lock.json')) {
    Run 'npm ci' { npm ci --no-audit --no-fund --loglevel=error }
  } else {
    Run 'npm install' { npm install --no-audit --no-fund --loglevel=error }
  }
  Set-Content -Path $stamp -Value $hash -Encoding ascii
}

if ($Check) {
  Run 'Typecheck' { npm run --silent typecheck }
  Run 'Uji simulasi (3 menit pertandingan bot)' { npm run --silent sim -- 3 }
  Write-Host 'Semua pemeriksaan lolos.' -ForegroundColor Green
  return
}
if ($Dev) {
  Step 'Mode dev: client http://localhost:5173, server http://localhost:3000 (Ctrl+C untuk berhenti)'
  npm run dev
  return
}

# ---------------------------------------------------------------- build web
Run 'Build client' { npm run --silent build:client }

if ($Server) {
  Run 'Build server' { npm run --silent build:server }
  Step 'Server produksi di http://localhost:3000 (Ctrl+C untuk berhenti)'
  npm run start
  return
}

if ($doPublish) {
  Step "Publikasi web ke $publishDir"
  Publish-Web (Join-Path $root 'dist\client') $publishDir
} elseif (-not $NoPublish) {
  Write-Host 'publishDir belum diatur (lihat build.local.example.json); publikasi dilewati.' -ForegroundColor Yellow
}

if ($doServer) {
  Run 'Build server untuk hosting' { npm run --silent build:host }
  Step "Unggah server multiplayer ke $serverDir"
  $serverBuild = Publish-Server (Join-Path $root 'dist\host') $serverDir
}

# ---------------------------------------------------------------- APK Android
if ($Apk) {
  $android = Join-Path $root 'android'
  if (-not (Test-Path $android)) {
    Run 'Membuat proyek Android (Capacitor)' { npx cap add android }
  }
  Run 'Sinkronisasi web -> Android' { npx cap sync android }

  # Kustomisasi yang harus bertahan walau proyek Android dibuat ulang.
  $manifest = Join-Path $android 'app\src\main\AndroidManifest.xml'
  $xml = Get-Content $manifest -Raw
  if ($xml -notmatch 'screenOrientation') {
    $xml = $xml -replace '(<activity\b)', '$1 android:screenOrientation="sensorLandscape"'
    [IO.File]::WriteAllText($manifest, $xml, (New-Object Text.UTF8Encoding($false)))
  }
  $overrides = Join-Path $root 'android-overrides'
  if (Test-Path $overrides) { Copy-Tree $overrides $android }

  # Capacitor 8 butuh JDK 21+. Pakai JAVA_HOME jika sudah cocok, kalau tidak cari JBR Android Studio.
  $jdk = Find-Jdk 21
  if (-not $jdk) { throw 'JDK 21+ tidak ditemukan. Pasang JDK 21 (atau Android Studio terbaru), atau set ASTRA_JAVA_HOME.' }
  Step "JDK: $jdk"
  $env:JAVA_HOME = $jdk
  $env:Path = (Join-Path $jdk 'bin') + ';' + $env:Path
  if (-not $env:ANDROID_HOME -and (Test-Path "$env:LOCALAPPDATA\Android\Sdk")) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
  if (-not $env:ANDROID_HOME) { throw 'Android SDK tidak ditemukan. Pasang Android Studio atau set ANDROID_HOME.' }

  Push-Location $android
  try { Run 'Gradle assembleDebug (build pertama mengunduh dependensi, bisa beberapa menit)' { .\gradlew.bat assembleDebug --console=plain -q --no-daemon } }
  finally { Pop-Location }

  $built = Join-Path $android 'app\build\outputs\apk\debug\app-debug.apk'
  if (-not (Test-Path $built)) { throw "APK tidak ditemukan di $built" }
  $apkOut = Join-Path $root 'astra-legion.apk'
  Copy-Item $built $apkOut -Force
  Write-Host "APK: $apkOut ($([math]::Round((Get-Item $apkOut).Length / 1MB, 1)) MB)" -ForegroundColor Green
  if ($doPublish -and $publishApk) {
    $apkTarget = Join-Path $apkDir 'astra-legion.apk'
    if ($serverDir) {
      Step "Publikasi APK ke $apkTarget (berupa potongan, disatukan oleh server hosting)"
      if (Publish-BigFile $apkOut $serverDir $apkTarget $healthUrl $apkUrl) {
        Write-Host "APK terpasang di hosting$(if ($apkUrl) { ": $apkUrl" })" -ForegroundColor Green
      } else {
        Write-Warning 'Potongan APK sudah terunggah, tetapi server hosting belum menyatukannya. Ia melakukannya saat dimulai ulang (restart situs Node.js di panel hosting, atau tunggu sampai kosong).'
      }
    } else {
      Step "Publikasi APK ke $apkTarget"
      if (-not (Test-Path $apkDir)) { New-Item -ItemType Directory -Force $apkDir | Out-Null }
      Copy-Item $apkOut $apkTarget -Force
    }
  }
}

# ---------------------------------------------------------------- verifikasi URL publik
if ($doPublish -and $publishUrl) {
  Step "Memeriksa $publishUrl"
  $bundle = (Get-ChildItem (Join-Path $root 'dist\client\assets') -Filter 'index-*.js' | Select-Object -First 1).Name
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $html = (Invoke-WebRequest -UseBasicParsing -Uri $publishUrl -TimeoutSec 30).Content
    if ($html -match [regex]::Escape($bundle)) { Write-Host "URL sudah menyajikan build terbaru ($bundle)." -ForegroundColor Green }
    else { Write-Warning "URL belum menyajikan build terbaru ($bundle). Mungkin masih cache; coba lagi sebentar." }
  } catch {
    Write-Warning "Gagal memeriksa URL: $($_.Exception.Message)"
  }
}

# ---------------------------------------------------------------- verifikasi server multiplayer
if ($serverBuild -and $healthUrl) {
  $health = $healthUrl
  Step "Memeriksa server multiplayer di $health"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $seen = $null
  # Server lama baru berhenti setelah melihat manifest baru (maks. 15 detik) dan tidak ada pemain;
  # permintaan berikutnya menyalakan build baru. Jadi dicoba beberapa kali.
  for ($try = 0; $try -lt 8; $try++) {
    try { $seen = (Invoke-WebRequest -UseBasicParsing -Uri $health -TimeoutSec 20).Content | ConvertFrom-Json } catch { $seen = $null }
    if ($seen -and $seen.build -eq $serverBuild) { break }
    Start-Sleep -Seconds 5
  }
  if ($seen -and $seen.build -eq $serverBuild) {
    Write-Host "Server multiplayer online dengan build terbaru ($serverBuild)." -ForegroundColor Green
  } elseif ($seen -and $seen.build) {
    Write-Warning "Server multiplayer masih menjalankan build $($seen.build) ($($seen.players) pemain). Ia berganti ke $serverBuild sendiri begitu kosong; atau restart situsnya di panel hosting."
  } else {
    Write-Warning 'Server multiplayer belum merespons. Jika situs Node.js-nya belum dibuat di panel hosting, lihat README bagian "Server multiplayer di web hosting".'
  }
}

Write-Host 'Selesai.' -ForegroundColor Green
