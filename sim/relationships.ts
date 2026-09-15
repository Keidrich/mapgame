/**
 * The web, as something you can look at.
 *
 * By late game the social layer is the deepest thing in the game — dozens of people you have
 * met, assets placed inside two outfits, a nemesis who has been at your door nine times, and a
 * connections graph underneath all of it that already decides how word travels. It has only ever
 * been presented as a list, and a list is the one shape that cannot show you the thing that
 * matters most: that your informant inside the Delgados is somebody's cousin, and that cousin is
 * the lieutenant who keeps turning up.
 *
 * **This adds no data.** Every field below is read from something that already exists — `Npc`,
 * `n.connections` (§3.6), `n.asset` (§3.9), `n.nemesis`, the ledger. The layout is computed here
 * rather than in the component for the ordinary reason: `/ui` draws, `/sim` decides, and a
 * position that depends on who is in the world is a derived value like any other.
 *
 * It is also deterministic — ring and angle come from a stable sort on id, never from a roll or
 * from iteration order — so the same save draws the same web every time it is opened, which is
 * what makes it a map rather than a lava lamp.
 */
import { PLAYER, type Id, type Npc, type World } from './types';
import { connectionsOf } from './connections';
import { isNemesis, nemesisName, notoriety, playerName } from './nemesis';
import { NEMESIS } from '@content/nemesis';

export type WebKind = 'you' | 'crew' | 'asset' | 'nemesis' | 'faction' | 'known';

export interface WebNode {
  id: Id;
  name: string;
  kind: WebKind;
  /** 0 is you. 1 is yours. 2 is theirs. 3 is everybody else who holds the thing together. */
  ring: number;
  /** Radians, stable across renders. */
  angle: number;
  /** Unit circle position, so the component only has to scale it. */
  x: number;
  y: number;
  /** One line of why they are on the map at all. */
  note: string;
  /** 0..1, how much weight to give them visually. */
  weight: number;
  /** Their ring is full enough that a label under every disc would overlap the next one. */
  crowded: boolean;
  factionId?: Id;
  /** Somebody who has had the better of you. Drawn as a threat however they got here. */
  hostile: boolean;
}

export interface WebLink { a: Id; b: Id; kind: 'family' | 'friend' | 'yours' }
export interface Web { nodes: WebNode[]; links: WebLink[] }

/** How many people the picture can hold before it stops being readable. */
export const WEB_MAX = 26;
/**
 * And how many may sit on any one ring, which is the constraint that actually bites. A late-game
 * player has a dozen crew, and thirteen circles on the inner ring is a solid mass of overlapping
 * discs with the labels printed on top of each other — measured from a screenshot, not guessed.
 * Whoever does not fit is still on the map, one ring out, where there is room.
 */
const RING_MAX = 9;
/** Where each ring sits, 0..1. Not evenly spaced: the inner ring needs room for a crew. */
const RING_R: Record<number, number> = { 1: 0.46, 2: 0.74, 3: 0.97 };

/** Ring 1 is yours, ring 2 is theirs, ring 3 is the connective tissue. */
function ringFor(kind: WebKind): number {
  return kind === 'you' ? 0 : kind === 'crew' || kind === 'asset' ? 1 : kind === 'nemesis' || kind === 'faction' ? 2 : 3;
}

function classify(w: World, n: Npc): { kind: WebKind; note: string; weight: number } | undefined {
  if (n.crew && n.crew.status !== 'dead') {
    return { kind: 'crew', note: `Yours — ${n.crew.status}, loyalty ${Math.round(n.crew.loyalty)}`, weight: 0.8 };
  }
  if (n.asset) {
    const f = n.asset.factionId ? w.factions[n.asset.factionId] : undefined;
    return { kind: 'asset', note: n.asset.kind === 'informant' ? `Listens for you${f ? ` inside ${f.short}` : ''}` : 'Turns up when it goes wrong', weight: 0.75 };
  }
  if (isNemesis(n)) {
    return { kind: 'nemesis', note: `Has had the better of you ${n.nemesis!.wins} time${n.nemesis!.wins === 1 ? '' : 's'} · notoriety ${Math.round(notoriety(n))}`, weight: 1 };
  }
  // Their people, but only the ones you have actually met. The map is your web, not the city's:
  // drawing a lieutenant you have never laid eyes on would both leak the roster and bury the
  // people who are genuinely something to you under a crowd of strangers.
  if (n.known && n.faction && n.faction !== PLAYER && (n.role === 'lieutenant' || n.role === 'boss')) {
    const f = w.factions[n.faction];
    return { kind: 'faction', note: `${n.role === 'boss' ? 'Runs' : 'Lieutenant,'} ${f?.short ?? 'an outfit'}`, weight: 0.6 };
  }
  return undefined;
}

/**
 * Everybody worth drawing, and what joins them.
 *
 * The roster is the people who are *already* something to the player — crew, assets, nemeses,
 * the people who run the outfits — plus the connective tissue: anybody they have met who is tied
 * to two or more of those. That last group is the reason this is a picture instead of four
 * lists; it is where "my informant is the nemesis's cousin" lives.
 */
export function relationshipWeb(w: World): Web {
  const people = Object.values(w.npcs).filter(n => n.alive);
  const primary = new Map<Id, { npc: Npc; kind: WebKind; note: string; weight: number }>();
  for (const n of people) {
    const c = classify(w, n);
    if (c) primary.set(n.id, { npc: n, ...c });
  }

  // the connective tissue: somebody you have met who ties two of the above together
  const bridges: { npc: Npc; kind: WebKind; note: string; weight: number }[] = [];
  for (const n of people) {
    if (primary.has(n.id) || !(n.known || n.rel.trust >= 20)) continue;
    const ties = connectionsOf(w, n).filter(c => primary.has(c.npc.id));
    if (ties.length < 2) continue;
    bridges.push({ npc: n, kind: 'known', note: `Between ${ties.slice(0, 2).map(t => t.npc.name.split(' ')[0]).join(' and ')}`, weight: 0.45 });
  }
  // strongest first, then by id so a tie never reorders the picture between two renders
  bridges.sort((a, b) => b.weight - a.weight || a.npc.id.localeCompare(b.npc.id));

  const chosen = [...primary.values(), ...bridges]
    .sort((a, b) => ringFor(a.kind) - ringFor(b.kind) || b.weight - a.weight || a.npc.id.localeCompare(b.npc.id))
    .slice(0, WEB_MAX);

  const nodes: WebNode[] = [{
    id: PLAYER, name: playerName(w), kind: 'you', ring: 0, angle: 0, x: 0, y: 0,
    note: `Respect ${Math.round(w.player.respect)} · fear ${Math.round(w.player.fear)}`, weight: 1, hostile: false, crowded: false,
  }];

  // Lay each ring out evenly, in the stable order above, starting from straight up. A ring that
  // is over its cap pushes the overflow outwards rather than dropping anybody: they are still
  // yours, they are just drawn where there is space.
  const rings: { c: typeof chosen[number]; ring: number }[] = [];
  const count: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  for (const c of chosen) {
    let ring = ringFor(c.kind);
    while (ring < 3 && count[ring] >= RING_MAX) ring++;
    count[ring]++;
    rings.push({ c, ring });
  }
  for (const ring of [1, 2, 3]) {
    const inRing = rings.filter(r => r.ring === ring).map(r => r.c);
    inRing.forEach((c, i) => {
      // the half-step offset stops rings lining up into spokes, which reads as a structure
      // that is not there
      const angle = (i + (ring % 2) * 0.5) / Math.max(1, inRing.length) * Math.PI * 2 - Math.PI / 2;
      const r = RING_R[ring];
      nodes.push({
        // the name they actually go by — an earned nickname replaces the given one here as it
        // does in the log, so the person on the map is the person in the story
        id: c.npc.id, name: nemesisName(c.npc), kind: c.kind, ring, angle,
        // a ring packed to its cap has no room for text under every disc
        crowded: inRing.length > 6,
        x: Math.cos(angle) * r, y: Math.sin(angle) * r,
        note: c.note, weight: c.weight, factionId: c.npc.faction,
        hostile: c.kind === 'nemesis' || notoriety(c.npc) >= NEMESIS.known / 2 || c.npc.rel.trust <= -40,
      });
    });
  }

  const on = new Set(nodes.map(n => n.id));
  const links: WebLink[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    if (n.id === PLAYER) continue;
    if (n.kind === 'crew' || n.kind === 'asset') links.push({ a: PLAYER, b: n.id, kind: 'yours' });
    for (const c of connectionsOf(w, w.npcs[n.id])) {
      if (!on.has(c.npc.id)) continue;
      const key = [n.id, c.npc.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ a: n.id, b: c.npc.id, kind: c.kind });
    }
  }
  return { nodes, links };
}
