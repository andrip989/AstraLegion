// Joystick virtual dan tombol serang untuk layar sentuh. File ini hanya mengurus elemen dan
// sentuhannya; arti gerak/serangnya ada di Controls (setStick, setAttack). Elemennya selalu ada
// di halaman, tetapi baru ditampilkan CSS pada layar sentuh (@media (pointer: coarse)).
import type { Controls } from './Controls';

/** Jarak tempuh kenop dari pusat, sebagai pecahan jari-jari alas joystick. */
const KNOB_TRAVEL = 0.6;

export class TouchPad {
  constructor(controls: Controls) {
    const zone = document.getElementById('joy-zone')!;
    const base = document.getElementById('joystick')!;
    const knob = document.getElementById('joy-knob')!;
    let pointer = -1;
    let cx = 0;
    let cy = 0;
    let travel = 1;

    const track = (e: PointerEvent) => {
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      const k = d > travel ? travel / d : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      controls.setStick({ x: (dx * k) / travel, y: (dy * k) / travel });
    };
    const release = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = -1;
      base.style.transform = '';
      knob.style.transform = '';
      base.classList.remove('active');
      controls.setStick(null);
    };
    zone.addEventListener('pointerdown', (e) => {
      if (pointer !== -1) return;
      e.preventDefault();
      pointer = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      // Joystick "mengambang": alasnya pindah ke titik sentuh (dijepit agar tetap di dalam zona),
      // jadi jempol tidak perlu tepat mengenai lingkarannya. Saat dilepas ia kembali ke tempatnya.
      base.style.transform = '';
      const home = base.getBoundingClientRect();
      const area = zone.getBoundingClientRect();
      const r = home.width / 2;
      travel = r * KNOB_TRAVEL;
      cx = Math.min(Math.max(e.clientX, area.left + r), area.right - r);
      cy = Math.min(Math.max(e.clientY, area.top + r), area.bottom - r);
      base.style.transform = `translate(${cx - (home.left + r)}px, ${cy - (home.top + r)}px)`;
      base.classList.add('active');
      track(e);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === pointer) track(e);
    });
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());

    const attack = document.getElementById('attack-btn')!;
    let attackPointer = -1;
    const letGo = (e: PointerEvent) => {
      if (e.pointerId !== attackPointer) return;
      attackPointer = -1;
      attack.classList.remove('held');
      controls.setAttack(false);
    };
    attack.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      attackPointer = e.pointerId;
      attack.setPointerCapture(e.pointerId);
      attack.classList.add('held');
      controls.setAttack(true);
    });
    attack.addEventListener('pointerup', letGo);
    attack.addEventListener('pointercancel', letGo);
    attack.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
