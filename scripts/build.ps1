<#
  Skrip build Astra Legion untuk Windows. Jalankan dari salinan repo di DISK LOKAL
  (bukan drive jaringan/WebDAV: node_modules dan Gradle sangat lambat di sana).

    build.cmd              build web ke dist/client, lalu publikasikan jika publishDir diatur
    build.cmd -Apk         seperti di atas + APK debug Android -> astra-legion.apk
    build.cmd -Check       typecheck + uji simulasi bot-vs-bot
    build.cmd -Dev         mode dev: client http://localhost:5173, server http://localhost:3000
    build.cmd -Server      build lalu jalankan server produksi di http://localhost:3000
    build.cmd -NoPublish   build saja, jangan menyalin apa pun ke publishDir

  Publikasi ke web hosting: buat build.local.json (tidak ikut git) di root repo; contohnya ada
  di build.local.example.json. Hanya hasil build (index.html, assets/, astra-legion.apk) yang
  disalin ke publishDir.
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
    Copy-Item $f.FullName (Join-Path $assetsTo $f.Name) -Force
  }
  foreach ($f in Get-ChildItem $from -File) {
    Write-Host "  $($f.Name)"
    Copy-Item $f.FullName (Join-Path $to $f.Name) -Force
  }
  $keep = $assets | ForEach-Object { $_.Name }
  foreach ($name in $existing.Keys) {
    if ($keep -notcontains $name) {
      Write-Host "  hapus aset lama: $name"
      Remove-Item (Join-Path $assetsTo $name) -Force -ErrorAction SilentlyContinue
    }
  }
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
# Tautan "Unduh APK" di lobby versi web: apkUrl dari konfigurasi, atau file di hosting jika publishApk aktif.
if ($cfg -and $cfg.apkUrl) { $env:VITE_APK_URL = $cfg.apkUrl }
elseif ($publishApk) { $env:VITE_APK_URL = './astra-legion.apk' }

# ---------------------------------------------------------------- dependensi
$stamp = Join-Path $root 'node_modules\.astra-stamp'
$hash = (Get-FileHash (Join-Path $root 'package.json')).Hash
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
    Step "Publikasi APK ke $publishDir"
    Copy-Item $apkOut (Join-Path $publishDir 'astra-legion.apk') -Force
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

Write-Host 'Selesai.' -ForegroundColor Green
