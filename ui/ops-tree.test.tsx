/**
 * The ops tree renders every op in the game, locked or not, which means `select.opLocked` runs
 * for all of them during React render. A throw there unmounts the app (DESIGN §9), so a new op
 * with a gate that reads a field some worlds do not have is a black screen, not a bad label.
 * This walks the whole roster in several world states for exactly that reason.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OP_DEFS } from '@content/rackets';
import { generateWorld } from '@sim/generate';
import { PLAYER, select, type OpKind, type World } from '@sim/index';
import { openCase } from '@sim/cases';
import { Rng } from '@sim/rng';
import { OpsTab } from './components/OpsTab';
import { OpTree } from './components/OpTree';
import { newGame } from './store';
import { plain } from './test-util';

const mk = (seed = 5) => { const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed }); w.pendingEvents = []; return w; };
const tree = (w: World) => { newGame(w); return plain(renderToString(<OpTree onPick={() => {}} />)); };
const tab = (w: World) => { newGame(w); return plain(renderToString(<OpsTab />)); };

/** A world well along: crew, safehouse, racket, a place, a weapon, a file, somebody inside. */
function established(seed = 5): World {
  const w = mk(seed);
  w.player.crewEver = 5;
  w.player.cash = 200000;
  w.player.items = ['glock19']; w.player.equipped = ['glock19'];
  for (const x of Object.values(w.npcs).filter(v => v.alive && !v.crew && v.role === 'patron').slice(0, 3)) {
    x.role = 'crew'; x.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
    w.player.crewIds.push(x.id);
  }
  w.npcs[w.player.crewIds[0]].crew!.status = 'jailed';
  w.npcs[w.player.crewIds[0]].crew!.statusDays = 20;
  const biz = Object.values(w.businesses)[0];
  biz.ownedBy = 'player'; w.player.businessIds.push(biz.id); biz.casedUntil = w.day + 3;
  openCase(w, 'heist', 'The Parade job', {}, [], new Rng(3));
  return w;
}

describe('the tree survives every op in every state', () => {
  it('renders for a brand new player', () => {
    const html = tree(mk());
    for (const k of Object.keys(OP_DEFS) as OpKind[]) expect(html, k).toContain(OP_DEFS[k].label);
  });

  it('renders for an established one, across several cities', () => {
    for (const seed of [3, 5, 9, 12]) {
      const html = tree(established(seed));
      expect(html.length, `seed ${seed}`).toBeGreaterThan(500);
    }
  });

  it('renders at war, which is when the stance-gated ops open', () => {
    const w = established();
    for (const f of Object.values(w.factions)) { f.stance[PLAYER] = 'war'; f.truceUntil[PLAYER] = 0; }
    const html = tree(w);
    expect(html).toContain(OP_DEFS.war_strike.label);
    expect(html).toContain(OP_DEFS.digital_strike.label);
  });

  it('renders with no authorities at all — an older save shape must not throw', () => {
    const w = established();
    delete w.authorities;
    expect(() => tree(w)).not.toThrow();
    expect(tree(w)).toContain(OP_DEFS.buy_down.label);
  });

  it('renders with no cases and with cases', () => {
    const bare = established(); bare.cases = [];
    expect(() => tree(bare)).not.toThrow();
    expect(() => tree(established())).not.toThrow();
  });

  it('every locked op gives a reason the tree can show', () => {
    for (const w of [mk(), established()]) {
      for (const k of Object.keys(OP_DEFS) as OpKind[]) {
        const why = select.opLocked(w, k);
        if (why) { expect(typeof why, k).toBe('string'); expect(why.length, k).toBeGreaterThan(4); }
      }
    }
  });
});

describe('the ops tab itself', () => {
  it('renders for a new player and for an established one', () => {
    expect(() => tab(mk())).not.toThrow();
    expect(tab(established())).toContain('Plan an op');
  });

  it('renders while a complication is waiting for an answer', () => {
    const w = established();
    w.confrontations = [{ id: 'x1', day: w.day, factionId: PLAYER, kind: 'op', war: false, text: 'Halfway through and somebody stood up.', opId: 'o_none', complication: 'not_alone' }];
    expect(() => tab(w)).not.toThrow();
  });
});
