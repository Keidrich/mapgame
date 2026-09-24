/**
 * The testing tools, in the menu. Every one is an ordinary `dispatch` of a `cheat` action, so a
 * world set up with them is a world the rest of the sim understands; and every one stamps the save
 * `cheated`, so nothing built with them is mistaken for real play. The same idea as the original's
 * (`sim/actions.ts: CheatKind`), sized to the Remake: each sets up one system so it can be reached
 * by hand without playing sixty days to get there.
 */
import { SAFEHOUSE_TIERS } from '@r/content/world';
import { hire } from './people';
import type { Rng } from './rng';
import type { CityId, World } from './types';
import { PLAYER } from './types';
import { addInfluence, clamp, log, nid } from './util';

export type CheatKind =
  | 'cash' | 'dirty' | 'ap' | 'heat' | 'fame' | 'crew' | 'safehouse' | 'kit' | 'stash' | 'war' | 'road';

export const CHEATS: { kind: CheatKind; label: string; what: string }[] = [
  { kind: 'cash', label: '+$10k clean', what: 'Ten thousand clean.' },
  { kind: 'dirty', label: '+$10k dirty', what: 'Ten thousand dirty.' },
  { kind: 'ap', label: 'Full energy', what: 'Action points back to the day\'s full.' },
  { kind: 'heat', label: 'Cool off', what: 'Heat to zero.' },
  { kind: 'fame', label: '+30 fear & respect', what: 'The street takes you seriously: rank, set-pieces, the seat.' },
  { kind: 'crew', label: '+3 crew here', what: 'Three good people from this city, hired.' },
  { kind: 'safehouse', label: 'A back room here', what: 'A tier-2 safehouse on the block you are on.' },
  { kind: 'kit', label: 'Guns and vests', what: 'A pistol and a kevlar vest for you, and a bat for everybody.' },
  { kind: 'stash', label: 'Fill the stash', what: 'Forty lots of everything, good quality.' },
  { kind: 'war', label: 'Start a war', what: 'The nearest outfit wants you dead.' },
  { kind: 'road', label: 'Open every road', what: 'Every city in the region is open to you.' },
];

const cityOf = (w: World, blockId: string): CityId => { const b = w.blocks[blockId]; return (b && w.districts[b.districtId]?.cityId) || 'c0'; };

export function cheat(w: World, what: CheatKind, rng: Rng) {
  const p = w.player;
  w.cheated = true;
  switch (what) {
    case 'cash': p.cash += 10000; break;
    case 'dirty': p.dirty += 10000; break;
    case 'ap': p.ap = p.apMax; break;
    case 'heat': p.heat = 0; break;
    case 'fame': p.fear = clamp(p.fear + 30); p.respect = clamp(p.respect + 30); break;
    case 'crew': {
      const here = cityOf(w, p.blockId);
      const pool = Object.values(w.npcs).filter(n => n.alive && !n.crew && !n.faction && !n.official && n.id !== w.fixerId && cityOf(w, n.homeBlockId) === here)
        .sort((a, b) => Math.max(...Object.values(b.skills)) - Math.max(...Object.values(a.skills)));
      for (const n of pool.slice(0, 3)) hire(w, n, 80);
      break;
    }
    case 'safehouse': {
      const b = w.blocks[p.blockId];
      if (b.safehouseId) { const s = w.safehouses[b.safehouseId]; if (s) s.tier = Math.max(s.tier, 2) as 1 | 2 | 3; break; }
      const id = nid(w, 's');
      w.safehouses[id] = { id, blockId: b.id, name: `${SAFEHOUSE_TIERS[1].label} on ${b.name}`, tier: 2, labs: [] };
      b.safehouseId = id; p.safehouseIds.push(id); addInfluence(w, b.id, PLAYER, 10);
      break;
    }
    case 'kit': {
      p.kit.weapon ??= 'pistol'; p.kit.armour ??= 'kevlar';
      for (const id of p.crewIds) { const c = w.npcs[id]?.crew; if (c) { c.kit ??= {}; c.kit.weapon ??= 'bat'; } }
      break;
    }
    case 'stash': for (const k of Object.keys(p.stash) as (keyof typeof p.stash)[]) p.stash[k] = { n: p.stash[k].n + 40, q: Math.max(p.stash[k].q, 65) }; break;
    case 'war': {
      const here = cityOf(w, p.blockId);
      const f = Object.values(w.factions).filter(x => x.alive && (w.districts[x.homeDistrictId]?.cityId || 'c0') === here).sort((a, b) => b.standing - a.standing)[0];
      if (f) { f.standing = -75; f.truceUntil = undefined; }
      break;
    }
    case 'road': for (const c of w.region?.cities ?? []) if (!c.founded) c.open = true; break;
  }
  log(w, `Testing tools: ${CHEATS.find(c => c.kind === what)?.what ?? what} This save is marked as tested.`, 'warn');
  void rng;
}
