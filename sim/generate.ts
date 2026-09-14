import { legworkFor } from './travel';
import type { GeoChunk } from '@geo/chunks';
import { chunkKeyAt, hexChunk } from '@geo/chunks';
import { distanceM } from '@geo/project';
import { Rng, hashString } from './rng';
import { BUSINESS_DEFS } from '@content/businesses';
import { BACKGROUND_BY_ID, BASE_SKILLS, TECH_START_RECIPES, WHEELS_BONUS_LEGWORK, legalCustomSkills } from '@content/backgrounds';
import { FIXER } from '@content/rackets';
import { addAuthority, attachOfficials, authorities } from './authority';
import { connect } from './connections';
import { addBusiness, mkNpc, populateChunk } from './populate';
import { unlockRecipe } from './production';
import { adjustRel } from './util';
import { PLAYER, type Block, type LatLng, type Npc, type Player, type Skills, type StartTraitId, type World } from './types';

export { controller, stanceFor, STEP_M } from './populate';
export const WORLD_VERSION = 8; // 8: the law is an entity (Authority) and the police-station bump is live, not baked
export const HEX_SIZE_M = 190;

export interface NewGameOptions {
  seed?: number;
  origin: LatLng;
  placeName: string;
  playerName: string;
  background: Player['background'];
  /** Only for background 'custom': a hand-built spread and the one edge they chose. */
  custom?: { skills: Partial<Skills>; trait: StartTraitId };
  chunk?: GeoChunk; // the start area, fetched by the UI; defaults to a hex chunk
  extraChunks?: GeoChunk[]; // neighbouring areas to populate at once (when the start sits near a chunk edge)
}

export const emptyStash = () => ({ booze: 0, green: 0, pills: 0, hot_goods: 0, counterfeit: 0, streetwear: 0 });

export function generateWorld(opts: NewGameOptions): World {
  const seed = opts.seed ?? hashString(`${opts.origin.lat.toFixed(4)},${opts.origin.lng.toFixed(4)}`);
  const rng = new Rng(seed);
  const chunk = opts.chunk ?? hexChunk(chunkKeyAt(opts.origin));
  const w: World = {
    version: WORLD_VERSION, seed, rng: seed, day: 1, origin: opts.origin, placeName: opts.placeName, mapSource: chunk.source, hexSizeM: HEX_SIZE_M,
    chunks: {}, districts: {}, blocks: {}, businesses: {}, npcs: {}, rackets: {}, safehouses: {}, productions: {}, ops: {}, crews: {}, factions: {},
    player: {
      name: opts.playerName, background: opts.background, startTrait: opts.background === 'custom' ? opts.custom?.trait : undefined,
      skills: startingSkills(opts.background, opts.custom?.skills),
      cash: 2500, dirty: 0, heat: 0, respect: 5, fear: 0, ap: 8, apMax: 8, stash: emptyStash(),
      legwork: 0, legworkMax: 0, currentBlockId: '', crewEver: 0, items: [], equipped: [],
      crewIds: [], safehouseIds: [], businessIds: [], racketIds: [], opIds: [], lawyer: false, jailedDays: 0, busts: 0, launderedToday: 0, homeBlockId: '',
    },
    pendingEvents: [], log: [], nextId: 1,
  };
  populateChunk(w, chunk, rng, { first: true, startAt: opts.origin });
  for (const extra of opts.extraChunks ?? []) populateChunk(w, extra, rng, { startAt: opts.origin });
  const nid = (p: string) => `${p}${w.nextId++}`;
  const blocks = Object.values(w.blocks);
  const startBlock = blocks.slice().sort((a, b) => distanceM(a.center, opts.origin) - distanceM(b.center, opts.origin))[0];

  // officials live downtown (or wherever the player starts), and they answer to a building
  const downtown = Object.values(w.districts).find(d => d.kind === 'downtown');
  const cityHall = (downtown && w.blocks[downtown.blockIds[0]]) ?? startBlock;
  addAuthority(w, 'city_hall', cityHall.id, `${opts.placeName} City Hall`, nid('au'));
  // A city with no police station anywhere on the real map would otherwise have no precinct at
  // all, and the law would be a building full of clerks. Put one on the busiest block going.
  if (!authorities(w).some(a => a.kind === 'precinct')) {
    const busiest = blocks.slice().sort((a, b) => b.police - a.police)[0] ?? startBlock;
    if (!busiest.tags.includes('police')) busiest.tags.push('police');
    addAuthority(w, 'precinct', busiest.id, `${busiest.name} Precinct`, nid('au'));
  }
  for (const kind of ['captain', 'councillor', 'judge'] as const) {
    const o = mkNpc(rng, w, nid, { role: 'official', homeBlockId: cityHall.id, nerveBias: 70 });
    o.official = { kind, corruption: rng.int(20, 80) };
    o.name = `${kind === 'captain' ? 'Capt.' : kind === 'judge' ? 'Judge' : 'Councillor'} ${o.name.split(' ').slice(-1)[0]}`;
  }
  // a captain belongs to a precinct, the councillor and the judge to city hall
  attachOfficials(w);
  // player start
  const used = new Set(Object.values(w.businesses).map(b => b.name));
  if (!startBlock.businessIds.length) addBusiness(rng, w, nid, startBlock, 'bar', used);
  for (const f of Object.keys(w.factions)) delete startBlock.influence[f];
  startBlock.influence[PLAYER] = 12;
  w.player.homeBlockId = startBlock.id; startBlock.tags.push('home');
  w.player.currentBlockId = startBlock.id;
  // wheels came up driving: legwork on top of what the skill itself gives
  w.player.legworkMax = legworkFor(w.player.skills.wheels) + (opts.background === 'wheels' ? WHEELS_BONUS_LEGWORK : 0);
  w.player.legwork = w.player.legworkMax;
  // home turf: people here already know your face
  for (const bid of startBlock.businessIds) for (const id of [w.businesses[bid].ownerId, ...w.businesses[bid].patronIds]) { const n = w.npcs[id]; if (n) { n.rel.trust += 10; n.known = true; } }
  // a guaranteed first mark: at least one extortable place on your block with an owner who folds
  const marks = startBlock.businessIds.map(id => w.businesses[id]).filter(b => BUSINESS_DEFS[b.type].rackets.includes('protection'));
  if (!marks.length) marks.push(addBusiness(rng, w, nid, startBlock, 'corner_store', used));
  const soft = marks.map(b => w.npcs[b.ownerId]).sort((a, b) => a.nerve - b.nerve)[0];
  if (soft.nerve > 35) { soft.nerve = rng.int(22, 35); if (!soft.traits.includes('coward')) soft.traits[1] = 'coward'; }
  const friend = startBlock.businessIds.flatMap(id => w.businesses[id].patronIds).map(id => w.npcs[id])[0];
  if (friend) { friend.rel.trust = 45; friend.rel.respect = 30; friend.notes.push('Knew you from before.'); }
  // A fixer within reach from day one. Dirty money buys nothing legitimate, and a laundering
  // racket costs clean cash the player may not have yet, so without somebody to wash a little
  // at a bad rate a bad opening can dead-end. They stand on the start block: zero legwork,
  // reachable before anything else in the city.
  addFixer(w, rng, nid, startBlock);
  // Every city has one back room. Pawn shops sell what they can display — a bat, a burner,
  // lockpicks — and the rest of the catalogue exists only under a counter, so a city without
  // one would cap the whole weapon ladder at a baseball bat.
  if (!Object.values(w.businesses).some(b => b.type === 'black_market')) {
    const near = blocks.slice().sort((a, b) => distanceM(a.center, opts.origin) - distanceM(b.center, opts.origin))
      .find(b => b.id !== startBlock.id && !b.abandoned) ?? startBlock;
    const m = addBusiness(rng, w, nid, near, 'black_market', used);
    w.log.push({ day: 1, text: `Somebody points you at ${m.name} on ${near.name}. They sell the kind of thing you cannot ask for by name.`, tone: 'info', refs: { businessId: m.id } });
  }
  const startOwner = w.npcs[w.businesses[startBlock.businessIds[0]].ownerId];
  startOwner.rel.trust = 20; startOwner.rel.respect = 15;

  w.log.push({ day: 1, text: `You arrive in ${opts.placeName}. ${startBlock.name} is where you'll start. Nobody knows your name yet.`, tone: 'info', refs: { blockId: startBlock.id } });
  // a tech already knows a trade; a hand-built character brings one edge of their own
  if (opts.background === 'tech') unlockRecipe(w, rng.pick(TECH_START_RECIPES), 'You have been making this since before you needed to.');
  if (opts.background === 'custom' && opts.custom) applyStartTrait(w, opts.custom.trait, startBlock);
  w.rng = rng.state;
  return w;
}

/**
 * The guaranteed early launderer. A person, not a business: no setup cost, nothing to own,
 * a worse rate than a racket and a small daily window, both of which improve as they come
 * to trust you. Seeded like the other two starting guarantees (the soft mark, the old
 * friend) — one NPC, on the block the player begins on.
 */
function addFixer(w: World, rng: Rng, nid: (p: string) => string, startBlock: Block): Npc {
  const n = mkNpc(rng, w, nid, { role: 'fixer', homeBlockId: startBlock.id, nerveBias: 55 });
  n.rel.trust = FIXER.startTrust;   // they know your name, and nothing more than that
  n.rel.respect = 10;
  n.known = true;                   // you were told who to ask for before you got off the bus
  n.notes.push('Washes money for a cut. The cut gets better the longer they know you.');
  // they hold court somewhere on the block, so the player finds them by opening the door
  const hangout = startBlock.businessIds[0];
  if (hangout) { w.businesses[hangout].patronIds.push(n.id); n.favouriteBusinessIds.push(hangout); }
  // everybody has people, this one included: a couple of ties into the block they work
  const locals = startBlock.businessIds.flatMap(id => [w.businesses[id].ownerId, ...w.businesses[id].patronIds]).map(id => w.npcs[id]).filter(x => x && x.id !== n.id);
  for (const other of locals.slice(0, 2)) connect(n, other, 'friend', 'knows everybody');
  return n;
}

export function startingSkills(bg: Player['background'], custom?: Partial<Skills>): Skills {
  if (bg === 'custom') return legalCustomSkills(custom);
  return { ...(BACKGROUND_BY_ID[bg]?.skills ?? BASE_SKILLS) };
}

/** The one edge a hand-built character picks. All of it lands at generation, none of it is a rule elsewhere. */
function applyStartTrait(w: World, trait: StartTraitId, startBlock: Block): void {
  const locals = startBlock.businessIds.flatMap(id => [w.businesses[id].ownerId, ...w.businesses[id].patronIds]).map(id => w.npcs[id]).filter(Boolean);
  switch (trait) {
    case 'connected': {
      for (const n of locals.filter(x => x.role === 'patron').slice(0, 2)) { n.rel.trust = Math.max(n.rel.trust, 45); n.rel.respect = Math.max(n.rel.respect, 25); n.known = true; n.notes.push('Knew you before any of this.'); }
      w.player.respect += 5;
      break;
    }
    case 'earner':
      w.player.cash += 2500;
      break;
    case 'local':
      startBlock.influence[PLAYER] = (startBlock.influence[PLAYER] ?? 0) + 10;
      w.player.respect += 5;
      for (const n of locals) n.known = true;
      break;
    case 'feared':
      w.player.fear += 15;
      for (const n of locals.filter(x => x.role === 'owner')) adjustRel(w, n, { fear: 12, trust: -5 }, 'backed');
      break;
  }
}
