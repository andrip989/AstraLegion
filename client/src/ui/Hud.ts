// HUD: HP/mana/XP, tombol skill + cooldown, gold, KDA, skor, jam, kill feed, respawn, game over.
import { HEROES, SKILL_KEYS, TEAM_NAMES, ULT_UNLOCK_LEVEL, type HeroDef, type HeroInfo, type Snapshot } from '../../../shared/src';
import type { View } from '../render/EntityViews';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

interface SkillEl {
  root: HTMLElement;
  cd: HTMLElement;
  cdt: HTMLElement;
}

export class Hud {
  private def: HeroDef | null = null;
  private skillEls: SkillEl[] = [];
  private me: HeroInfo | undefined;
  private lastOver: number | null = null;

  constructor(
    mode: 'online' | 'offline',
    private onSkill: (slot: number) => void,
  ) {
    $('hud').classList.remove('hidden');
    const badge = $('mode-badge');
    badge.textContent = mode === 'online' ? 'ONLINE' : 'OFFLINE · LATIHAN VS BOT';
    badge.className = mode;
  }

  private buildSkills(def: HeroDef): void {
    this.def = def;
    const box = $('skills');
    box.innerHTML = '';
    this.skillEls = [];
    const accent = '#' + def.accent.toString(16).padStart(6, '0');
    $('hero-name').textContent = def.name;
    def.skills.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'skill';
      el.style.setProperty('--sc', accent);
      el.innerHTML = `<span class="key">${SKILL_KEYS[i]}</span><span class="nm">${s.name}</span><span class="mana">${s.mana}</span><div class="cd"></div><span class="cdt"></span>`;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onSkill(i);
      });
      el.addEventListener('pointerenter', () => {
        const tip = $('tooltip');
        tip.innerHTML = `<b>${SKILL_KEYS[i]} · ${s.name}</b><br>${s.desc}<br><small>Cooldown ${s.cooldown} dtk · Mana ${s.mana}${s.range ? ` · Jarak ${s.range}` : ''}${i === 3 ? ` · Terbuka di level ${ULT_UNLOCK_LEVEL}` : ''}</small>`;
        tip.classList.remove('hidden');
      });
      el.addEventListener('pointerleave', () => $('tooltip').classList.add('hidden'));
      box.appendChild(el);
      this.skillEls.push({ root: el, cd: el.querySelector('.cd')!, cdt: el.querySelector('.cdt')! });
    });
  }

  feed(text: string): void {
    const box = $('feed');
    const el = document.createElement('div');
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 5) box.firstChild!.remove();
    setTimeout(() => el.remove(), 6500);
  }

  update(s: Snapshot, self: View | undefined): void {
    const y = s.you;
    if (!this.def || this.def.id !== y.def) {
      const def = HEROES[y.def];
      if (def) this.buildSkills(def);
    }
    if (s.heroes) this.me = s.heroes.find((h) => h.id === y.id);
    for (const e of s.events) if (e.k === 'msg') this.feed(e.s);

    // bar
    const hp = y.alive && self ? self.hp : 0;
    const maxHp = self ? self.maxHp : 1;
    $('hp-fill').style.transform = `scaleX(${Math.max(0, Math.min(1, hp / maxHp))})`;
    $('hp-text').textContent = self ? `${hp} / ${maxHp}` : '';
    $('mp-fill').style.transform = `scaleX(${y.maxMana ? y.mana / y.maxMana : 0})`;
    $('mp-text').textContent = `${y.mana} / ${y.maxMana}`;
    $('xp-fill').style.transform = `scaleX(${y.xpNext ? Math.min(1, y.xp / y.xpNext) : 1})`;
    $('hero-level').textContent = `Lv ${y.level}`;
    $('gold').textContent = String(y.gold);
    if (this.me) $('kda').textContent = `${this.me.k} / ${this.me.d} / ${this.me.a}`;
    $('wave').textContent = `Wave ${s.nextWave}s`;

    // skill
    if (this.def) {
      this.def.skills.forEach((sk, i) => {
        const el = this.skillEls[i];
        const cd = y.cds[i] ?? 0;
        el.cd.style.height = `${Math.min(100, (cd / sk.cooldown) * 100)}%`;
        el.cdt.textContent = cd > 0 ? (cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1)) : '';
        el.root.classList.toggle('oncd', cd > 0);
        el.root.classList.toggle('nomana', y.mana < sk.mana);
        el.root.classList.toggle('locked', i === 3 && y.level < ULT_UNLOCK_LEVEL);
      });
    }

    // topbar
    $('score-blue').textContent = String(s.score[0]);
    $('score-red').textContent = String(s.score[1]);
    const t = Math.floor(s.t);
    $('clock').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

    // overlay
    $('respawn').classList.toggle('hidden', y.alive || s.over !== null);
    $('respawn-time').textContent = String(y.respawn);
    if (s.over !== this.lastOver) {
      this.lastOver = s.over;
      const go = $('gameover');
      go.classList.toggle('hidden', s.over === null);
      if (s.over !== null) {
        const win = s.over === y.team;
        go.className = win ? 'win' : 'lose';
        $('gameover-title').textContent = win ? 'MENANG' : 'KALAH';
        this.feed(`Tim ${TEAM_NAMES[s.over]} memenangkan pertandingan`);
      }
    }
  }

  showDisconnect(): void {
    $('disconnect').classList.remove('hidden');
  }
}
