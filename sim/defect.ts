/**
 * A faction's lieutenant crossing the floor to you.
 *
 * The mirror of `flipLieutenant`, which has always handled the other direction — one of yours
 * being poached away — and which had no opposite. There was no way to take somebody off a faction
 * short of killing them.
 *
 * What this deliberately is *not* is a loyalty number you grind down. It is gated exactly the way
 * every other major concession in the game is gated, through `concessionReason`: you have to know
 * them properly, and they have to owe you something real or you have to have a hold over them. The
 * intended route in is their own agenda — a lieutenant's debt, or their resentment of their own
 * boss — settled through `resolve_agenda`, which calls `doFavour` and opens this. Nothing new had
 * to be built for that: it is the same path a shopkeeper's protection goes through.
 *
 * It is the single most damaging thing the player can do to a faction, so it costs a favour, two
 * AP, a bed, and every point of standing they had with the outfit.
 */
import { DEFECT } from '@content/nemesis';
import { concessionReason, familiarReason } from './standing';
import { nemesisName, notoriety } from './nemesis';
import { remember } from './ledger';
import { addInfluence, clamp, log, money } from './util';
import { addMemory } from './people';
import { PLAYER, type Npc, type World } from './types';

/** Why they will not come. Undefined when they will. */
export function defectReason(w: World, n: Npc): string | undefined {
  if (n.crew) return 'They already work for you.';
  if (!n.faction || n.faction === PLAYER) return `${n.name} has no outfit to walk away from.`;
  if (n.role === 'boss') return 'A boss does not walk away from his own house. Take it from him.';
  if (n.role !== 'lieutenant') return `${n.name} is not somebody whose leaving would mean anything.`;
  const f = w.factions[n.faction];
  if (!f?.alive) return 'There is nothing left of that outfit to leave.';
  const stranger = familiarReason(w, n); if (stranger) return stranger;
  // the same gate as protection, a place in the crew, or a friendly price — and for a bigger ask
  const why = concessionReason(w, n, 'walking out on their own people');
  if (why) return `${why} Settling something of theirs is what opens this.`;
  if (n.traits.includes('loyal')) return `${n.name} is loyal to a fault. Whatever you did for them, it does not buy this.`;
  return undefined;
}

export function defect(w: World, n: Npc): void {
  const f = n.faction ? w.factions[n.faction] : undefined; if (!f) return;
  const p = w.player;
  const name = nemesisName(n);

  f.lieutenantIds = f.lieutenantIds.filter(id => id !== n.id);
  f.soldiers = Math.max(0, f.soldiers - DEFECT.soldiers);
  f.standing[PLAYER] = clamp(f.standing[PLAYER] - DEFECT.standing, -100, 100);
  f.grudges.push(`took:${n.name.split(' ')[0]}`);

  // somebody who has been beating you arrives harder than somebody who has not
  const loyalty = clamp(DEFECT.loyalty + Math.round(notoriety(n) / 5));
  n.faction = PLAYER; n.role = 'crew';
  n.crew = { loyalty, cut: DEFECT.cut, status: 'idle', statusDays: 0, joinedDay: w.day };
  p.crewIds.push(n.id); p.crewEver++;
  // their old ground tilts: the soldiers who liked them are not going to be as careful
  const d = w.districts[f.homeDistrictId];
  for (const bid of d?.blockIds ?? []) if ((w.blocks[bid]?.influence[f.id] ?? 0) > 0) addInfluence(w, bid, PLAYER, DEFECT.influence);

  const line = `They walked out of ${f.name} and came to you.`;
  remember(w, n, 'deal', line);
  if (d?.blockIds[0]) addMemory(w, d.blockIds[0], 'defect', `${name} left ${f.short}. Nobody says where they went.`);
  log(w, `${name} is yours. ${f.name} lose a lieutenant, ${DEFECT.soldiers} soldiers and a great deal of face — and they know exactly who to blame. ${money(DEFECT.cut)}/day, loyalty ${Math.round(loyalty)}.`, 'good', { npcId: n.id, factionId: f.id });
}
