/**
 * Armour: the one thing in the kit bag with no job to do.
 *
 * Every other item in `content/items.ts` exists to change how a job goes. Armour changes nothing
 * about any job at all — it is the defence-side term in the one piece of arithmetic that decides
 * what happens on the night somebody comes for you personally (`landOnPlayer`, via
 * `personalCover`). That is the whole of it, and the negative claim is the load-bearing one: if
 * armour ever helps an op, it has stopped being armour and become a better gun.
 */
import { describe, expect, it } from 'vitest';
import { ITEM_DEFS } from '@content/items';
import { generateWorld, select, type World } from './index';
import { personalCover } from './legacy';
import { kitCover } from './items';

const ARMOUR = Object.values(ITEM_DEFS).filter(i => i.category === 'armor');
const mk = (): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 8 });
  w.pendingEvents = []; w.day = 20;
  w.player.skills = { muscle: 8, brains: 8, charm: 8, wheels: 8, tech: 8 };
  return w;
};
const wear = (w: World, id: string) => { w.player.items = [id]; w.player.equipped = [id]; };

describe('there is armour, and it is armour', () => {
  it('exists as its own category with more than one thing in it', () => {
    expect(ARMOUR.length).toBeGreaterThanOrEqual(2);
    for (const a of ARMOUR) expect(a.mods.cover ?? 0, a.id).toBeGreaterThan(0);
  });

  it('and nothing that is not armour offers cover', () => {
    for (const i of Object.values(ITEM_DEFS)) {
      if (i.category === 'armor') continue;
      expect(i.mods.cover ?? 0, `${i.id} is quietly armour`).toBe(0);
    }
  });
});

describe('it soaks the personal risk, which is the only thing it does', () => {
  it('raises the number the night is measured against', () => {
    const w = mk();
    const bare = personalCover(w);
    for (const a of ARMOUR) {
      wear(w, a.id);
      expect(personalCover(w), a.id).toBe(bare + a.mods.cover!);
    }
  });

  it('counts only what is on you, not what is in a drawer at home', () => {
    const w = mk();
    const bare = personalCover(w);
    w.player.items = ['plate_carrier']; w.player.equipped = [];
    expect(personalCover(w)).toBe(bare);
    w.player.equipped = ['plate_carrier'];
    expect(personalCover(w)).toBeGreaterThan(bare);
  });

  it('and more of it is more cover, so the ladder is a real ladder', () => {
    const rung = ARMOUR.slice().sort((a, b) => a.cost - b.cost);
    for (let i = 1; i < rung.length; i++) {
      expect(rung[i].mods.cover!, `${rung[i].id} costs more and covers no better`).toBeGreaterThan(rung[i - 1].mods.cover!);
    }
  });
});

describe('it does nothing to a job', () => {
  it('no armour has an approach bias or a heat multiplier — not small ones, none', () => {
    for (const a of ARMOUR) {
      expect(a.mods.approachBias, `${a.id} changes how an op goes`).toBeUndefined();
      expect(a.mods.heatMult, `${a.id} changes what an op leaves behind`).toBeUndefined();
    }
  });

  it('so carrying it moves neither the odds of a loud job nor a quiet one', () => {
    const w = mk();
    const crew = Object.values(w.npcs).filter(n => n.alive).slice(0, 3)
      .map(n => { n.crew = { loyalty: 60, cut: 100, status: 'idle', statusDays: 0, joinedDay: 1 }; n.role = 'crew'; return n.id; });
    w.player.crewIds = crew;
    for (const approach of ['loud', 'quiet', 'inside'] as const) {
      const bare = select.opChance(w, 'heist_bank', crew, approach);
      wear(w, 'vest');
      expect(select.opChance(w, 'heist_bank', crew, approach), `${approach} moved`).toBe(bare);
      w.player.equipped = [];
    }
  });

  it('and leaves the heat a job makes exactly where it was', () => {
    const w = mk();
    for (const a of ARMOUR) {
      wear(w, a.id);
      expect(select.kitHeatMult(w), a.id).toBe(1);
    }
  });

  it('the one thing the heavy end does cost is moving, and it says so in skillBoost', () => {
    // Not an approach bias and not a heat multiplier: a plate carrier does not make a burglary
    // louder, it makes *you* slower, which is `wheels` and is read the same way any other kit is.
    const heavy = ARMOUR.slice().sort((a, b) => (b.mods.cover ?? 0) - (a.mods.cover ?? 0))[0];
    expect(heavy.mods.skillBoost?.wheels ?? 0, `${heavy.id} is free to wear`).toBeLessThan(0);
    const light = ARMOUR.slice().sort((a, b) => (a.mods.cover ?? 0) - (b.mods.cover ?? 0))[0];
    expect(light.mods.skillBoost?.wheels ?? 0, 'the light one should cost nothing to wear').toBe(0);
  });
});

describe('and it competes for the same three slots as everything else', () => {
  it('a vest on is a gun off, which is the decision', () => {
    const w = mk();
    w.player.items = ['vest', 'glock19', 'lockpicks', 'sedan'];
    w.player.equipped = ['glock19', 'lockpicks', 'sedan'];
    expect(select.equipSlotsLeft(w)).toBe(0);
    expect(kitCover(w)).toBe(0);
    w.player.equipped = ['vest', 'lockpicks', 'sedan'];
    expect(kitCover(w)).toBe(ITEM_DEFS.vest.mods.cover);
  });
});
