<#
  Buat ikon aplikasi dan splash screen Android dari logo game.

    powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1

  Sumber : moba_logo_1024.png di root repo (logo persegi bersudut bulat).
  Hasil  : android-overrides\app\src\main\res\...  (disalin ke proyek Android tiap build APK)
           - mipmap-*\ic_launcher.png, ic_launcher_round.png   ikon untuk Android lama
           - mipmap-*\ic_launcher_foreground.png               lapisan depan ikon adaptif
           - values\ic_launcher_background.xml                 warna lapisan belakangnya
           - drawable*\splash.png                              layar pembuka, ukuran mengikuti
                                                               splash bawaan di folder android\
  Logo untuk web (client\public\logo.svg) dibuat terpisah dari moba_logo.svg.
  Jalankan lagi setelah mengganti logo, lalu build APK seperti biasa (build.cmd -Apk).
#>
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'moba_logo_1024.png'
if (-not (Test-Path $source)) { throw "Logo tidak ditemukan: $source" }
$logo = New-Object Drawing.Bitmap $source
$res = Join-Path $root 'android-overrides\app\src\main\res'
$template = Join-Path $root 'android\app\src\main\res'

# Warna latar = warna logo di tengah sisi-sisinya, supaya logo menyatu dengan latar ikon/splash.
$m = [int]($logo.Width / 2)
$edge = @($logo.GetPixel($m, 6), $logo.GetPixel($m, $logo.Height - 7), $logo.GetPixel(6, $m), $logo.GetPixel($logo.Width - 7, $m))
$avg = { param($pick) [int](($edge | ForEach-Object $pick | Measure-Object -Average).Average) }
$back = [Drawing.Color]::FromArgb(255, (& $avg { $_.R }), (& $avg { $_.G }), (& $avg { $_.B }))
$backHex = '#{0:X2}{1:X2}{2:X2}' -f $back.R, $back.G, $back.B

# Kanvas $w x $h (transparan, atau diisi $fill) dengan logo setinggi $size piksel di tengahnya.
function Save-Canvas([int]$w, [int]$h, [double]$size, [string]$path, $fill = $null) {
  $bmp = New-Object Drawing.Bitmap $w, $h, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
  if ($fill) { $g.Clear($fill) } else { $g.Clear([Drawing.Color]::Transparent) }
  $s = [int][math]::Round($size)
  $rect = New-Object Drawing.Rectangle ([int](($w - $s) / 2)), ([int](($h - $s) / 2)), $s, $s
  $attr = New-Object Drawing.Imaging.ImageAttributes
  $attr.SetWrapMode([Drawing.Drawing2D.WrapMode]::TileFlipXY) # tanpa ini tepi gambar jadi semi-transparan
  $g.DrawImage($logo, $rect, 0, 0, $logo.Width, $logo.Height, [Drawing.GraphicsUnit]::Pixel, $attr)
  $attr.Dispose()
  $g.Dispose()
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  $bmp.Save($path, [Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# ---- ikon peluncur. Ikon adaptif: kanvas 108dp, yang pasti terlihat hanya lingkaran 66dp di
# tengah, jadi logo digambar 62dp supaya pita namanya tidak terpotong di peluncur berikon bulat.
$density = [ordered]@{ mdpi = 1; hdpi = 1.5; xhdpi = 2; xxhdpi = 3; xxxhdpi = 4 }
foreach ($d in $density.Keys) {
  $k = $density[$d]
  $dir = Join-Path $res "mipmap-$d"
  Save-Canvas (48 * $k) (48 * $k) (48 * $k) (Join-Path $dir 'ic_launcher.png')
  Save-Canvas (48 * $k) (48 * $k) (48 * $k) (Join-Path $dir 'ic_launcher_round.png')
  Save-Canvas (108 * $k) (108 * $k) (62 * $k) (Join-Path $dir 'ic_launcher_foreground.png')
}
$values = Join-Path $res 'values'
if (-not (Test-Path $values)) { New-Item -ItemType Directory -Force $values | Out-Null }
$xml = "<?xml version=`"1.0`" encoding=`"utf-8`"?>`n<resources>`n    <color name=`"ic_launcher_background`">$backHex</color>`n</resources>`n"
[IO.File]::WriteAllText((Join-Path $values 'ic_launcher_background.xml'), $xml, (New-Object Text.UTF8Encoding($false)))

# ---- splash: satu file untuk tiap splash bawaan di proyek Android, dengan ukuran yang sama
$count = 0
if (Test-Path $template) {
  foreach ($f in Get-ChildItem $template -Recurse -Filter 'splash.png') {
    $old = New-Object Drawing.Bitmap $f.FullName
    $w = $old.Width
    $h = $old.Height
    $old.Dispose()
    $rel = $f.FullName.Substring($template.Length + 1)
    Save-Canvas $w $h ([math]::Min($w, $h) * 0.5) (Join-Path $res $rel) $back
    $count++
  }
} else {
  Write-Warning 'Folder android\ belum ada (dibuat saat build APK pertama); splash dilewati. Jalankan skrip ini lagi setelahnya.'
}
$logo.Dispose()
Write-Host "Ikon peluncur untuk $($density.Count) kerapatan layar dan $count splash ditulis ke $res (latar $backHex)."
