import { legworkFor } from './travel';
import type { GeoChunk } from '@geo/chunks';
import { chunkKeyAt, hexChunk } from '@geo/chunks';
import { distanceM } from '@geo/project';
import { Rng, hashString } from './rng';
import { BUSINESS_DEFS, TIERS } from '@content/businesses';
import { BACKGROUND_BY_ID, BASE_SKILLS, TECH_START_RECIPES, WHEELS_BONUS_LEGWORK, legalCustomSkills } from '@content/backgrounds';
import { FIXER } from '@content/rackets';
import { addAuthority, attachOfficials, authorities } from './authority';
import { connect } from './connections';
import { addBusiness, mkNpc, populateChunk } from './populate';
import { unlockRecipe } from './production';
import { adjustRel } from './util';
import { PLAYER, type Block, type District, type Id, type LatLng, type Npc, type Player, type Skills, type StartTraitId, type World } from './types';
import { LOVED } from './legacy';
import { LANDMARKS } from '@content/landmarks';
import { nerveFloorFor } from './tiers';

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

  // The five places there is only one of.
  //
  // **Converted, not added.** An earlier version called `addBusiness`, which puts a new building
  // and a new owner on a block after the generation passes have already run — and that quietly
  // moved everything downstream of them: an owner with no connections (the graph pass was over),
  // a business standing on a block that had already been marked derelict, and enough influence
  // shifted to change what a block's neighbours inherit. Promoting a building that is already
  // there changes nothing except what it is called and what it is worth, which is all a landmark
  // actually needs to be.
  const promoted = new Set<Id>();
  const taken = new Set<Id>();
  for (const lm of LANDMARKS) {
    const district = Object.values(w.districts).find(d => d.kind === lm.district as District['kind']);
    // Nothing here rolls: promotion must not consume a single number off `rng`, or every
    // generated thing after it moves and the world stops being the world that seed makes.
    // It also leaves anything carrying a real OSM name alone where it can — a landmark should
    // not eat a building the map actually has.
    const candidates = (district ? district.blockIds : Object.keys(w.blocks))
      .flatMap(id => w.blocks[id]?.businessIds ?? [])
      .map(id => w.businesses[id])
      .filter(b => b && !promoted.has(b.id) && b.ownedBy === 'npc' && !b.landmark && !w.blocks[b.blockId]?.abandoned)
      .sort((a, b) => Number(a.flags.includes('real')) - Number(b.flags.includes('real')) || a.id.localeCompare(b.id));
    const pick = candidates[0] ?? Object.values(w.businesses).find(b => !promoted.has(b.id) && b.ownedBy === 'npc' && !b.landmark);
    if (!pick) continue;
    promoted.add(pick.id);
    const bd = BUSINESS_DEFS[lm.type];
    const wasTier = TIERS[BUSINESS_DEFS[pick.type].tier].income;
    pick.type = lm.type;
    pick.name = lm.name;
    pick.landmark = lm.id;
    pick.flags = pick.flags.filter(f => f !== 'real');
    pick.baseIncome = Math.max(bd.income[0], Math.round(pick.baseIncome * (TIERS[bd.tier].income / wasTier)));
    pick.value = Math.max(1500, Math.round(pick.baseIncome * bd.valueMult / 100) * 100);
    // and the owner of a chartered institution was never going to be frightened of anybody
    const owner = w.npcs[pick.ownerId];
    if (owner) owner.nerve = Math.max(owner.nerve, nerveFloorFor(lm.type));

    // The one person always found here — promoted the same way the building was, and for the same
    // reason: **nothing here rolls**. A patron the place already had is renamed and given the
    // record, so no new person is placed, the connections graph is untouched, and not one number
    // comes off `rng`. A promoted person is never taken twice, because a patron can be a regular
    // at two places and two landmarks sharing a face would read as a bug.
    if (lm.person) {
      const host = pick.patronIds.map(id => w.npcs[id]).find(n => n?.alive && !taken.has(n.id))
        ?? Object.values(w.npcs).filter(n => n.alive && n.role === 'patron' && n.homeBlockId === pick.blockId && !taken.has(n.id) && n.id !== pick.ownerId)
          .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (host) {
        taken.add(host.id);
        host.name = lm.person.name;
        host.role = lm.person.role;
        host.nerve = Math.max(host.nerve, lm.person.nerve);
        host.known = true;                                   // everybody knows who runs the count room
        if (!host.traits.includes(lm.person.trait)) host.traits = [...host.traits, lm.person.trait];
        // Raised to, never lowered: the city's own roll stands where it was already generous.
        for (const [k, v] of Object.entries(lm.person.skills)) {
          host.skills = { ...host.skills, [k]: Math.max(host.skills[k as keyof typeof host.skills], v as number) };
        }
        host.notes.push(lm.person.note);
        // This is what makes them "always found there": `npcLocation` returns `[0]` of this list,
        // so the landmark has to be the *only* entry, not merely present. The host was very likely
        // already a regular there — that is how they were found — and simply being in the list left
        // them turning up at whichever bar they also drank in.
        for (const other of host.favouriteBusinessIds) {
          if (other === pick.id) continue;
          const b = w.businesses[other];
          if (b) b.patronIds = b.patronIds.filter(id => id !== host.id);
        }
        host.favouriteBusinessIds = [pick.id];
        if (!pick.patronIds.includes(host.id)) pick.patronIds.push(host.id);
      }
    }
  }

  // Somebody outside all of it. Generated like any other person, then marked — what makes them
  // different is `w.player.lovedId` and nothing on the record itself, so every existing system
  // treats them as an ordinary neighbour who happens to trust you completely.
  const loved = mkNpc(rng, w, nid, { role: 'patron', homeBlockId: startBlock.id });
  loved.known = true;
  loved.rel.trust = LOVED.trust; loved.rel.metDay = 1; loved.rel.contacts = 99;
  loved.favouriteBusinessIds = [];
  loved.notes.push('Nothing to do with any of it, and it is going to stay that way.');
  w.player.lovedId = loved.id;
  // Somebody with no ties to anybody is an anomaly in this city — the connections pass gives
  // everyone people, and it ran before this one existed. Neighbours, not relatives: they are
  // the player's family, and the point of them is that they belong to the ordinary world.
  for (const other of startBlock.businessIds.flatMap(id => w.businesses[id].patronIds).map(id => w.npcs[id]).filter(Boolean).slice(0, 3)) {
    connect(loved, other, 'friend', 'neighbour');
  }

  w.log.push({ day: 1, text: `You arrive in ${opts.placeName}. ${startBlock.name} is where you'll start. Nobody knows your name yet.`, tone: 'info', refs: { blockId: startBlock.id } });
  w.log.push({ day: 1, text: `${loved.name} came with you and knows none of it. Keep it that way.`, tone: 'info', refs: { npcId: loved.id } });
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
