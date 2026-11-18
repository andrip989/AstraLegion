// Klip suara announcer. Isinya dibuat oleh scripts/make-voice.mjs (satu modul teks base64 per
// kalimat di voice/), dan baru dimuat saat pertama kali dibutuhkan.

export type VoiceLine =
  | 'first_blood'
  | 'first_kill'
  | 'second_kill'
  | 'double_kill'
  | 'triple_kill'
  | 'quadra_kill'
  | 'penta_kill'
  | 'killing_spree'
  | 'rampage'
  | 'unstoppable'
  | 'dominating'
  | 'godlike'
  | 'legendary'
  | 'executed'
  | 'shut_down'
  | 'wiped_out'
  | 'tower'
  | 'begin'
  | 'victory'
  | 'defeat';

const loaders = import.meta.glob<string>('./voice/*.ts', { import: 'default' });
const cache = new Map<string, Promise<AudioBuffer | null>>();

/** Klip yang sudah didekode; null bila tidak ada atau gagal dimuat (suara itu dilewati saja). */
export function loadVoice(ctx: BaseAudioContext, id: VoiceLine): Promise<AudioBuffer | null> {
  let clip = cache.get(id);
  if (!clip) {
    const load = loaders[`./voice/${id}.ts`];
    clip = load
      ? load()
          .then((base64) => {
            const bin = atob(base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return ctx.decodeAudioData(bytes.buffer);
          })
          .catch(() => null)
      : Promise.resolve(null);
    cache.set(id, clip);
  }
  return clip;
}

/** Muat semua klip di latar belakang supaya pengumuman pertama tidak terlambat. */
export function preloadVoices(ctx: BaseAudioContext): void {
  for (const key of Object.keys(loaders)) void loadVoice(ctx, key.slice('./voice/'.length, -'.ts'.length) as VoiceLine);
}
