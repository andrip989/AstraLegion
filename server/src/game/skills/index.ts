// Registry handler skill: id skill (dari shared/heroes.ts) -> fungsi efek di server.
import type { SkillDef } from '../../../../shared/src';
import type { Game } from '../Game';
import type { Hero } from '../entities';
import { emberLancerSkills } from './emberLancer';
import { lumenSageSkills } from './lumenSage';
import { novaStrikerSkills } from './novaStriker';
import { shadowFangSkills } from './shadowFang';
import { voltTitanSkills } from './voltTitan';

export interface CastCtx {
  game: Game;
  hero: Hero;
  def: SkillDef;
  /** Titik target, sudah dijepit ke jangkauan skill. */
  x: number;
  z: number;
  /** Arah bidik (ternormalisasi). */
  dirX: number;
  dirZ: number;
  lvl: number;
}

/** Kembalikan `false` jika cast gagal (mana & cooldown tidak dipotong). */
export type SkillHandler = (c: CastCtx) => boolean | void;

export const SKILL_HANDLERS: Record<string, SkillHandler> = {
  ...voltTitanSkills,
  ...novaStrikerSkills,
  ...shadowFangSkills,
  ...lumenSageSkills,
  ...emberLancerSkills,
};
