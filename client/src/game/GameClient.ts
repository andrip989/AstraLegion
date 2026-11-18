// Perakit sisi client: menerima snapshot dari transport, memperbarui tampilan, suara & HUD,
// meneruskan input pemain sebagai perintah ke server, dan mencatat hasil pertandingan ke akun.
import type { Snapshot } from '../../../shared/src';
import { accountLevel, accounts } from '../account/accounts';
import { GameSounds } from '../audio/gameSounds';
import { sound } from '../audio/Sound';
import { Controls } from '../input/Controls';
import { TouchPad } from '../input/TouchPad';
import type { Transport } from '../net/transport';
import { Effects } from '../render/Effects';
import { EntityViews } from '../render/EntityViews';
import { buildMap, type MapView } from '../render/MapView';
import { SceneManager } from '../render/SceneManager';
import { onSettings, settings } from '../settings';
import { Hud } from '../ui/Hud';
import { Minimap } from '../ui/Minimap';
import { closeModal, isModalOpen, openSettings } from '../ui/panels';

export class GameClient {
  private sm: SceneManager;
  private map: MapView;
  private views: EntityViews;
  private fx: Effects;
  private sounds: GameSounds;
  private controls: Controls;
  private hud: Hud;
  private minimap: Minimap;
  private lastFrame = performance.now();
  private time = 0;
  private selfId = 0;
  private wasAlive = true;
  private lastOver: number | null = null;
  private fpsClock = 0;
  private fpsFrames = 0;

  /** `onLogout`: dipanggil bila pemain keluar dari akunnya lewat pengaturan. */
  constructor(
    private transport: Transport,
    onLogout: () => void,
    /** Kode room pribadi yang dimasuki ('' = room umum). */
    private room = '',
  ) {
    this.sm = new SceneManager(document.getElementById('game') as HTMLCanvasElement);
    this.map = buildMap(this.sm.scene);
    // tanpa shadow map (layar sentuh), unit diberi bayangan bulat sederhana
    this.views = new EntityViews(this.sm.scene, !this.sm.renderer.shadowMap.enabled);
    this.fx = new Effects(this.sm, this.views);
    this.sounds = new GameSounds(this.views);
    this.views.onFootstep = (x, z) => this.fx.dust(x, z);
    this.views.onDeath = (v) => {
      this.fx.death(v);
      this.sounds.death(v);
    };
    this.controls = new Controls(this.sm, this.views, this.fx, (cmd) => transport.send(cmd));
    new TouchPad(this.controls);
    const showSettings = () => openSettings(true, onLogout, () => this.toLobby());
    this.hud = new Hud(transport.mode, {
      cast: (slot) => this.controls.castSlot(slot, true),
      buy: (item) => transport.send({ t: 'buy', item }),
      sell: (slot) => transport.send({ t: 'sell', slot }),
      recall: () => transport.send({ t: 'recall' }),
      openSettings: showSettings,
      chat: (s, all) => transport.send({ t: 'chat', s, all }),
      ping: (kind) => transport.send({ t: 'ping', kind }),
      emote: (kind) => transport.send({ t: 'emote', kind }),
      spell: () => this.controls.castSpell(true),
      toLobby: () => this.toLobby(),
      aim: (slot, v, cancel) => this.controls.aimSkill(slot, v, cancel),
      castAimed: (slot, v) => this.controls.castAimed(slot, v),
    });
    this.controls.onUi = (what, down) => {
      if (what === 'shop') this.hud.toggleShop();
      else if (what === 'quickbuy') this.hud.quickBuy();
      else if (what === 'board') this.hud.showScoreboard(down);
      else if (what === 'ping') this.hud.togglePing();
      else if (what === 'chat' || what === 'chatall') {
        if (!isModalOpen()) this.hud.openChat(what === 'chatall');
      }
      else if (isModalOpen()) closeModal();
      else if (this.hud.isShopOpen) this.hud.toggleShop(false);
      else showSettings();
    };
    this.minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, this.sm, this.views, () =>
      this.controls.setFollow(false),
    );

    const followBtn = document.getElementById('follow-btn')!;
    const syncFollow = (on: boolean) => followBtn.classList.toggle('on', on);
    this.controls.onFollowChange = syncFollow;
    syncFollow(this.controls.follow);
    followBtn.addEventListener('click', () => {
      this.controls.setFollow(!this.controls.follow);
      this.controls.centerOnSelf();
    });

    const applySettings = () => {
      this.sm.shakeEnabled = settings.shake;
      this.hud.setFps(0, settings.showFps);
    };
    onSettings(applySettings);
    applySettings();
    sound.startMusic();
    sound.say('begin');

    transport.onSnapshot = (s) => this.onSnapshot(s);
    transport.onDisconnect = () => this.hud.showDisconnect();
    transport.onLink = (state) => this.hud.setReconnecting(state === 'lost');
    this.sm.onNotice = (text) => this.hud.feed(text);
    // pegangan debug untuk konsol browser & tes otomatis
    (window as unknown as { __astra: unknown }).__astra = { sm: this.sm, views: this.views, controls: this.controls, hud: this.hud, client: this, sound };
    requestAnimationFrame(() => this.frame());
  }

  private onSnapshot(s: Snapshot): void {
    this.views.apply(s);
    this.sm.setMatchTime(s.t); // suasana siang, senja, malam mengikuti waktu pertandingan
    this.fx.handle(s.events);
    this.sounds.handle(s.events);
    this.minimap.handle(s.events);
    this.controls.heroDef = s.you.def;
    this.hud.update(s, this.views.self);
    // hero baru (awal match / match di-reset) atau baru bangkit: pusatkan kamera
    const respawned = s.you.alive && !this.wasAlive;
    this.wasAlive = s.you.alive;
    if (s.you.id !== this.selfId || respawned) {
      this.selfId = s.you.id;
      const me = this.views.self;
      if (me) this.sm.target.set(me.x, 0, me.z);
    }
    if (s.over !== this.lastOver) {
      this.lastOver = s.over;
      if (s.over !== null) void this.finishMatch(s);
    }
  }

  /**
   * Tinggalkan pertandingan dan kembali ke lobby. Halaman dimuat ulang: itu cara paling pasti untuk
   * membuang seluruh scene 3D, dan lobby langsung tampil lagi karena akun/tamu sudah tersimpan.
   */
  private toLobby(): void {
    this.transport.close();
    location.reload();
  }

  /**
   * Pertandingan selesai: tampilkan ringkasannya dan apa yang didapat akun. Akun di perangkat
   * dicatat di sini. Untuk akun online, hasilnya dicatat server dari datanya sendiri dan yang
   * ditampilkan adalah jawaban server; `rec` di bawah tidak pernah dikirim ke server.
   */
  private async finishMatch(s: Snapshot): Promise<void> {
    const win = s.over === s.you.team;
    sound.play(win ? 'win' : 'lose');
    sound.say(win ? 'victory' : 'defeat');
    const me = this.hud.self;
    const rec = { hero: s.you.def, win, k: me?.k ?? 0, d: me?.d ?? 0, a: me?.a ?? 0, dur: s.t, mode: this.transport.mode };
    const minutes = `${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}`;
    const head = (r: { k: number; d: number; a: number }) =>
      `<div class="go-row"><span>K / D / A</span><b>${r.k} / ${r.d} / ${r.a}</b></div><div class="go-row"><span>Durasi</span><b>${minutes}</b></div>`;
    // K/D/A tampil dulu; baris akun menyusul begitu hasilnya jelas (akun online menunggu kabar server)
    this.hud.setMatchSummary(head(rec));
    const before = accounts.current();
    const { account, xp, missions, unlocked, skipped } = await accounts.recordMatch(rec);
    if (this.lastOver === null) return; // pertandingan berikutnya sudah dimulai selagi menunggu
    // yang tercatat di akun (untuk akun online: angka server) adalah yang ditampilkan
    let html = head((!skipped && account?.profile.history[0]) || rec);
    if (skipped) {
      // tidak dicatat ke akun (mis. latihan offline dengan akun online): sebutkan alasannya, bukan XP
      html += `<small class="go-note">${skipped}</small>`;
    } else if (account) {
      const lv = accountLevel(account.profile.xp);
      const up = before ? lv.level > accountLevel(before.profile.xp).level : false;
      html +=
        `<div class="go-row"><span>XP akun</span><b>+${xp}</b></div>` +
        `<div class="xpbar"><div style="width:${Math.round((lv.into / lv.need) * 100)}%"></div></div>` +
        `<small>${up ? 'Naik ke level akun' : 'Level akun'} ${lv.level} · ${lv.into} / ${lv.need} XP</small>`;
      // misi harian yang tercapai dan pencapaian yang baru terbuka
      for (const m of missions) html += `<div class="go-row bonus"><span>Misi: ${m.text}</span><b>+${m.xp} XP</b></div>`;
      for (const name of unlocked) html += `<div class="go-row bonus"><span>Pencapaian baru</span><b>${name}</b></div>`;
      if (up || missions.length || unlocked.length) sound.play('levelup');
    } else {
      html += `<small>Bermain sebagai tamu: masuk atau daftar akun supaya XP (+${xp}) dan statistik tersimpan.</small>`;
    }
    this.hud.setMatchSummary(html);
  }

  private frame(): void {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;

    this.map.update(this.time);
    this.views.update(dt, this.sm.camera, this.time);
    this.controls.update(dt);
    // selagi tumbang, kamera mengikuti kawan yang sedang ditonton
    const watched = this.hud.spectating ? this.views.get(this.hud.spectating) : undefined;
    if (watched) this.sm.target.set(watched.root.position.x, 0, watched.root.position.z);
    this.fx.update(dt);
    this.minimap.update(dt);
    this.sounds.listenAt(this.sm.target.x, this.sm.target.z);
    this.sm.render(dt);
    this.fpsClock += dt;
    this.fpsFrames++;
    if (this.fpsClock > 0.5) {
      if (settings.showFps) this.hud.setFps(Math.round(this.fpsFrames / this.fpsClock), true);
      this.hud.setNet(this.room, this.transport.latency);
      this.fpsClock = 0;
      this.fpsFrames = 0;
    }
  }
}
