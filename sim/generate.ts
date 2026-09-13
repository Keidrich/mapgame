import type { GeoChunk } from '@geo/chunks';
import { chunkKeyAt, hexChunk } from '@geo/chunks';
import { distanceM } from '@geo/project';
import { Rng, hashString } from './rng';
import { addBusiness, mkNpc, populateChunk } from './populate';
import { PLAYER, type LatLng, type Player, type Skills, type World } from './types';

export { controller, stanceFor, STEP_M } from './populate';
export const WORLD_VERSION = 3;
export const HEX_SIZE_M = 190;

export interface NewGameOptions {
  seed?: number;
  origin: LatLng;
  placeName: string;
  playerName: string;
  background: Player['background'];
  chunk?: GeoChunk; // the start area, fetched by the UI; defaults to a hex chunk
  extraChunks?: GeoChunk[]; // neighbouring areas to populate at once (when the start sits near a chunk edge)
}

export const emptyStash = () => ({ booze: 0, green: 0, pills: 0, hot_goods: 0, counterfeit: 0 });

export function generateWorld(opts: NewGameOptions): World {
  const seed = opts.seed ?? hashString(`${opts.origin.lat.toFixed(4)},${opts.origin.lng.toFixed(4)}`);
  const rng = new Rng(seed);
  const chunk = opts.chunk ?? hexChunk(chunkKeyAt(opts.origin));
  const w: World = {
    version: WORLD_VERSION, seed, rng: seed, day: 1, origin: opts.origin, placeName: opts.placeName, mapSource: chunk.source, hexSizeM: HEX_SIZE_M,
    chunks: {}, districts: {}, blocks: {}, businesses: {}, npcs: {}, rackets: {}, safehouses: {}, productions: {}, ops: {}, factions: {},
    player: {
      name: opts.playerName, background: opts.background, skills: startingSkills(opts.background),
      cash: 2500, dirty: 0, heat: 0, respect: 5, fear: 0, ap: 8, apMax: 8, stash: emptyStash(),
      crewIds: [], safehouseIds: [], businessIds: [], racketIds: [], opIds: [], lawyer: false, jailedDays: 0, busts: 0, launderedToday: 0,
    },
    pendingEvents: [], log: [], nextId: 1,
  };
  populateChunk(w, chunk, rng, { first: true, startAt: opts.origin });
  for (const extra of opts.extraChunks ?? []) populateChunk(w, extra, rng, { startAt: opts.origin });
  const nid = (p: string) => `${p}${w.nextId++}`;
  const blocks = Object.values(w.blocks);
  const startBlock = blocks.slice().sort((a, b) => distanceM(a.center, opts.origin) - distanceM(b.center, opts.origin))[0];

  // officials live downtown (or wherever the player starts)
  const downtown = Object.values(w.districts).find(d => d.kind === 'downtown');
  const cityHall = (downtown && w.blocks[downtown.blockIds[0]]) ?? startBlock;
  for (const kind of ['captain', 'councillor', 'judge'] as const) {
    const o = mkNpc(rng, w, nid, { role: 'official', homeBlockId: cityHall.id, nerveBias: 70 });
    o.official = { kind, corruption: rng.int(20, 80) };
    o.name = `${kind === 'captain' ? 'Capt.' : kind === 'judge' ? 'Judge' : 'Councillor'} ${o.name.split(' ').slice(-1)[0]}`;
  }
  // player start
  const used = new Set(Object.values(w.businesses).map(b => b.name));
  if (!startBlock.businessIds.length) addBusiness(rng, w, nid, startBlock, 'bar', used);
  for (const f of Object.keys(w.factions)) delete startBlock.influence[f];
  startBlock.influence[PLAYER] = 12;
  const friend = startBlock.businessIds.flatMap(id => w.businesses[id].patronIds).map(id => w.npcs[id])[0];
  if (friend) { friend.rel.trust = 45; friend.rel.respect = 30; friend.notes.push('Knew you from before.'); }
  const startOwner = w.npcs[w.businesses[startBlock.businessIds[0]].ownerId];
  startOwner.rel.trust = 20; startOwner.rel.respect = 15;

  w.rng = rng.state;
  w.log.push({ day: 1, text: `You arrive in ${opts.placeName}. ${startBlock.name} is where you'll start. Nobody knows your name yet.`, tone: 'info', refs: { blockId: startBlock.id } });
  return w;
}

function startingSkills(bg: Player['background']): Skills {
  const s = { muscle: 4, brains: 4, charm: 4, wheels: 3, tech: 2 };
  if (bg === 'muscle') s.muscle = 8; else if (bg === 'brains') { s.brains = 8; s.tech = 4; } else s.charm = 8;
  return s;
}
