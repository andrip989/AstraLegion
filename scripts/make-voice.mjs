// Buat klip suara announcer:   node scripts/make-voice.mjs   (hanya di Windows)
//
// Tiap kalimat disintesis dengan TTS bawaan Windows (System.Speech, suara "Microsoft David"),
// dipangkas heningnya, dinormalkan, lalu dienkode ke MP3 mono kecil dan ditulis sebagai modul
// teks base64 di client/src/audio/voice/<id>.ts. Bentuk modul (bukan file .mp3) dipilih supaya
// klip ikut jalur yang sama dengan kode: dipecah kecil-kecil saat build, lolos unggahan WebDAV,
// dan ikut terunduh oleh pembaruan di dalam APK (yang mengunduh file sebagai teks).
//
// Karakter suaranya (nada lebih berat, gema arena) ditambahkan saat diputar, di Sound.say().
// Untuk menambah kalimat: tambahkan di LINES, jalankan skrip ini, lalu pakai id-nya di client.
import { Mp3Encoder } from '@breezystack/lamejs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LINES = {
  first_blood: 'First blood!',
  first_kill: 'First kill!',
  second_kill: 'Second kill!',
  double_kill: 'Double kill!',
  triple_kill: 'Triple kill!',
  quadra_kill: 'Quadra kill!',
  penta_kill: 'Penta kill!',
  killing_spree: 'Killing spree!',
  rampage: 'Rampage!',
  unstoppable: 'Unstoppable!',
  dominating: 'Dominating!',
  godlike: 'God like!',
  legendary: 'Legendary!',
  executed: 'Executed!',
  shut_down: 'Shut down!',
  wiped_out: 'Wiped out!',
  tower: 'Tower destroyed!',
  begin: 'Let the battle begin!',
  victory: 'Victory!',
  defeat: 'Defeat!',
  titan: 'The Titan awakens!',
  titan_slain: 'Titan slain!',
};

const RATE = 22050;
const KBPS = 48;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'client', 'src', 'audio', 'voice');
const tmp = mkdtempSync(join(tmpdir(), 'astra-voice-'));

// ---- 1. sintesis ke WAV (PCM 16-bit mono) lewat PowerShell
writeFileSync(join(tmp, 'lines.json'), JSON.stringify(LINES));
writeFileSync(
  join(tmp, 'tts.ps1'),
  `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$dir = $PSScriptRoot
$lines = Get-Content (Join-Path $dir 'lines.json') -Raw | ConvertFrom-Json
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(${RATE}, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft David Desktop')
$s.Rate = -2
$s.Volume = 100
foreach ($p in $lines.PSObject.Properties) {
  $s.SetOutputToWaveFile((Join-Path $dir ($p.Name + '.wav')), $fmt)
  $s.Speak($p.Value)
}
$s.SetOutputToNull()
$s.Dispose()
`,
);
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(tmp, 'tts.ps1')], { stdio: 'inherit' });

// ---- 2. pangkas, normalkan, enkode
/** Ambil sampel PCM 16-bit mono dari file WAV. */
function readWav(file) {
  const b = readFileSync(file);
  let at = 12;
  let fmt = null;
  while (at + 8 <= b.length) {
    const id = b.toString('ascii', at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(at + 10), rate: b.readUInt32LE(at + 12), bits: b.readUInt16LE(at + 22) };
    if (id === 'data') {
      if (!fmt || fmt.channels !== 1 || fmt.bits !== 16 || fmt.rate !== RATE) throw new Error(`format WAV tak terduga: ${JSON.stringify(fmt)}`);
      return new Int16Array(b.buffer.slice(b.byteOffset + at + 8, b.byteOffset + at + 8 + Math.min(size, b.length - at - 8)));
    }
    at += 8 + size + (size & 1);
  }
  throw new Error(`tidak ada data di ${file}`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
let total = 0;
for (const [id, text] of Object.entries(LINES)) {
  const pcm = readWav(join(tmp, `${id}.wav`));
  // pangkas hening di kedua ujung (sisakan sedikit supaya awal/akhir kata tidak terpotong)
  const quiet = 350;
  let a = 0;
  let z = pcm.length - 1;
  while (a < z && Math.abs(pcm[a]) < quiet) a++;
  while (z > a && Math.abs(pcm[z]) < quiet) z--;
  a = Math.max(0, a - Math.round(RATE * 0.012));
  z = Math.min(pcm.length - 1, z + Math.round(RATE * 0.06));
  const cut = pcm.slice(a, z + 1);
  // normalkan puncak, lalu fade pendek di ujung agar tidak "klik"
  let peak = 1;
  for (const v of cut) peak = Math.max(peak, Math.abs(v));
  const gain = (32767 * 0.92) / peak;
  const fade = Math.round(RATE * 0.008);
  for (let i = 0; i < cut.length; i++) {
    const edge = Math.min(1, i / fade, (cut.length - 1 - i) / fade);
    cut[i] = Math.round(cut[i] * gain * edge);
  }
  const enc = new Mp3Encoder(1, RATE, KBPS);
  const chunks = [];
  for (let i = 0; i < cut.length; i += 1152) chunks.push(Buffer.from(enc.encodeBuffer(cut.subarray(i, i + 1152))));
  chunks.push(Buffer.from(enc.flush()));
  const mp3 = Buffer.concat(chunks);
  total += mp3.length;
  writeFileSync(
    join(outDir, `${id}.ts`),
    `// Dibuat oleh scripts/make-voice.mjs; jangan diedit. ${JSON.stringify(text)}, MP3 mono ${RATE} Hz (base64).\nexport default '${mp3.toString('base64')}';\n`,
  );
  console.log(`${id.padEnd(14)} ${(cut.length / RATE).toFixed(2)} dtk  ${(mp3.length / 1024).toFixed(1)} KB  "${text}"`);
}
rmSync(tmp, { recursive: true, force: true });
console.log(`${readdirSync(outDir).length} klip, total ${(total / 1024).toFixed(0)} KB MP3 -> client/src/audio/voice/`);
