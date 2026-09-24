/**
 * The Commission: the bosses at one table, every ten days, once three outfits stand.
 *
 * A proposal is chosen by what the city looks like — too many wars and it is a peace; somebody
 * getting too big and it is a sanction on them (which can be you); a player the street respects
 * gets offered a seat — announced three days ahead so you can lobby, and settled by a vote. Each
 * boss votes on temperament and self-interest first, then on how they feel about you, then on
 * what you did about it: money, a favour they owe you. With a seat, your vote counts.
 *
 * The original's Commission (docs/DESIGN.md §6) had the same five proposals; this one reads every
 * vote off `leanOf`, which the UI shows before the meeting, so a vote you lost is one you could see
 * coming.
 *
 * Every city has its own table: its own outfits, its own meetings, its own seat for you. The home
 * city's is `w.commission`, where it always was; the others are in `w.commissions`, made the first
 * night a city is founded, and first meet ten days later.
 */
import { lobbyMult } from './family';
import { factionBlocks } from './factions';
import type { Rng } from './rng';
import type { Commission, Faction, Owner, Proposal, World } from './types';
import { PLAYER } from './types';
import { addInfluence, clamp, fullName, log, money, theName } from './util';

export const COMMISSION = { startDay: 20, every: 10, minOutfits: 3, announceDays: 3 };

export function newCommission(first = COMMISSION.startDay): Commission { return { nextDay: first, seated: false, pulls: {}, history: [] }; }

const cityOfF = (w: World, f: Faction) => w.districts[f.homeDistrictId]?.cityId || 'c0';
const alive = (w: World, city = 'c0') => Object.values(w.factions).filter(f => f.alive && cityOfF(w, f) === city);
/** One city's table. */
export function commissionOf(w: World, city = 'c0'): Commission {
  if (city === 'c0') return w.commission;
  return ((w.commissions ??= {})[city] ??= newCommission(w.day + COMMISSION.every));
}
const blockCityOf = (w: World, id: string) => w.districts[w.blocks[id].districtId]?.cityId || 'c0';

export function describeProposal(w: World, p: Proposal): string {
  const who = (o?: Owner) => (o === PLAYER ? 'you' : o && w.factions[o] ? theName(w.factions[o]) : 'somebody');
  switch (p.kind) {
    case 'peace': return 'The peace: every feud at the table pauses for ten days, yours included.';
    case 'tax': return `The pot: every outfit at the table pays a tenth of its money to the biggest — ${who(p.target)}.`;
    case 'sanction': return `A sanction on ${who(p.target)}: the table turns its back on them.`;
    case 'claim': return `A claim: ${who(p.target)} to be recognised in ${w.districts[p.districtId!]?.name}.`;
    case 'seat': return 'A seat at the table, for you.';
  }
}

/** How big each owner is, by blocks held. */
function biggest(w: World, city: string): { owner: Owner; blocks: number } {
  const counts: Record<Owner, number> = { [PLAYER]: Object.values(w.blocks).filter(b => blockCityOf(w, b.id) === city).filter(b => { let bv = 0, best = ''; for (const [k, v] of Object.entries(b.influence)) if (v > bv) { bv = v; best = k; } return best === PLAYER && bv >= 30; }).length };
  for (const f of alive(w, city)) counts[f.id] = factionBlocks(w, f.id).length;
  const [owner, blocks] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { owner, blocks };
}

function choose(w: World, rng: Rng, city: string): Proposal {
  const fs = alive(w, city);
  const wars = fs.reduce((t, f) => t + Object.entries(f.relations).filter(([o, r]) => r < -60 && w.factions[o]?.alive).length, 0) / 2 + fs.filter(f => f.standing < -55).length;
  const big = biggest(w, city);
  const total = Object.values(w.blocks).filter(b => blockCityOf(w, b.id) === city).length;
  const c = commissionOf(w, city);
  const at = city === 'c0' ? {} : { city };
  if (wars >= 2) return { kind: 'peace', announced: w.day, ...at };
  if (big.blocks / Math.max(1, total) > 0.2) return { kind: 'sanction', target: big.owner, announced: w.day, ...at };
  if (!c.seated && w.player.respect >= 40) return { kind: 'seat', target: PLAYER, announced: w.day, ...at };
  if (rng.chance(0.5)) return { kind: 'tax', target: big.owner, announced: w.day, ...at };
  // a claim: an outfit wants a district it half holds recognised as its own
  const f = rng.pick(fs);
  const districts = Object.values(w.districts).filter(d => d.id !== f.homeDistrictId && d.blockIds.some(id => (w.blocks[id].influence[f.id] ?? 0) > 10));
  const d = districts.length ? rng.pick(districts) : w.districts[f.homeDistrictId];
  return { kind: 'claim', target: f.id, districtId: d.id, announced: w.day, ...at };
}

/**
 * Where a boss stands on the proposal, before and after you have worked on them. Positive is yes.
 * The UI shows this, and the vote is exactly its sign.
 */
export function leanOf(w: World, f: Faction, p: Proposal): number {
  const boss = w.npcs[f.bossId];
  let n = 0;
  switch (p.kind) {
    case 'peace': n = f.temperament === 'aggressive' ? -20 : f.temperament === 'cautious' ? 25 : 10; break;
    case 'tax': n = p.target === f.id ? 60 : f.temperament === 'greedy' ? -30 : -12; if (p.target === PLAYER) n += f.standing / 3; break;
    case 'sanction': n = p.target === f.id ? -100 : p.target === PLAYER ? -f.standing / 2 + (f.temperament === 'aggressive' ? 10 : 0) : -(f.relations[p.target!] ?? 0) / 2 - 5; break;
    case 'claim': n = p.target === f.id ? 60 : (f.relations[p.target!] ?? 0) / 2 - (w.districts[p.districtId!]?.blockIds.some(id => (w.blocks[id].influence[f.id] ?? 0) > 10) ? 25 : 0); break;
    case 'seat': n = f.standing / 1.5 + (f.temperament === 'cunning' ? 10 : f.temperament === 'aggressive' ? -12 : 0) + (w.player.fear > 50 ? 8 : 0) - 5; break;
  }
  if (boss?.rel.owes) n += 20 * (p.target === PLAYER || p.kind === 'seat' ? 1 : 0);
  n += commissionOf(w, cityOfF(w, f)).pulls[f.id] ?? 0;
  return Math.round(n);
}

/** What leaning on a boss before the vote costs: more the less they like you. */
/** An envelope for one boss before a meeting; the consigliere knows who takes less (`family.ts`). */
export const lobbyCost = (f: Faction, w?: World) => Math.round(((1500 + Math.max(0, -f.standing) * 60) * (w ? lobbyMult(w) : 1)) / 100) * 100;
export const LOBBY_PULL = 30;

export function tally(w: World, p: Proposal): { yes: number; no: number; passes: boolean; votes: { id: Owner; yes: boolean }[] } {
  const city = p.city ?? 'c0'; const c = commissionOf(w, city);
  const votes = alive(w, city).map(f => ({ id: f.id, yes: leanOf(w, f, p) > 0 }));
  if (c.seated && c.vote) votes.push({ id: PLAYER, yes: c.vote === 'yes' });
  const yes = votes.filter(v => v.yes).length, no = votes.length - yes;
  return { yes, no, passes: yes > no, votes };
}

export function tickCommission(w: World, rng: Rng) {
  // the home table first, as it always ran; then every other city you have founded, in region order
  tickTable(w, rng, 'c0');
  for (const rc of w.region?.cities ?? []) if (rc.id !== 'c0' && rc.founded) tickTable(w, rng, rc.id);
}
function tickTable(w: World, rng: Rng, city: string) {
  const c = commissionOf(w, city);
  const where = city === 'c0' ? '' : ` of ${w.region?.cities.find(x => x.id === city)?.name ?? city}`;
  if (alive(w, city).length < COMMISSION.minOutfits) { if (w.day >= c.nextDay) c.nextDay = w.day + COMMISSION.every; c.proposal = undefined; return; }
  if (!c.proposal && w.day >= c.nextDay - COMMISSION.announceDays) {
    c.proposal = choose(w, rng, city);
    log(w, `The Commission${where} meets on day ${c.nextDay}. On the table: ${describeProposal(w, c.proposal)}`, 'war');
  }
  if (c.proposal && w.day >= c.nextDay) {
    resolve(w, c.proposal);
    c.nextDay = w.day + COMMISSION.every; c.proposal = undefined; c.pulls = {}; c.vote = undefined;
  }
}

function resolve(w: World, p: Proposal) {
  const city = p.city ?? 'c0';
  const c = commissionOf(w, city);
  const t = tally(w, p);
  const pl = w.player;
  const where = city === 'c0' ? '' : ` of ${w.region?.cities.find(x => x.id === city)?.name ?? city}`;
  let text = `The Commission${where} votes ${t.yes}–${t.no} ${t.passes ? 'for' : 'against'} ${describeProposal(w, p).split(':')[0].toLowerCase()}.`;
  if (t.passes) switch (p.kind) {
    case 'peace':
      for (const f of alive(w, city)) { f.truceUntil = w.day + 10; f.standing = Math.max(f.standing, -25); for (const o of Object.keys(f.relations)) f.relations[o] = clamp(f.relations[o] + 20, -100, 100); }
      text += ' Ten quiet days, by agreement.';
      break;
    case 'tax': {
      let pot = 0;
      for (const f of alive(w, city)) if (f.id !== p.target) { const cut = Math.round(Math.max(0, f.cash) * 0.1); f.cash -= cut; pot += cut; }
      if (c.seated && p.target !== PLAYER) { const cut = Math.round((pl.dirty + pl.cash) * 0.05); const d = Math.min(pl.dirty, cut); pl.dirty -= d; pl.cash -= cut - d; pot += cut; }
      if (p.target === PLAYER) { pl.dirty += pot; text += ` ${money(pot)} comes to you.`; }
      else if (w.factions[p.target!]) { w.factions[p.target!].cash += pot; text += ` ${money(pot)} goes to ${theName(w.factions[p.target!])}.`; }
      break;
    }
    case 'sanction':
      if (p.target === PLAYER) { for (const f of alive(w, city)) f.standing = clamp(f.standing - 15, -100, 100); text += ' Every outfit in the city is colder to you tonight.'; }
      else { const tf = w.factions[p.target!]; if (tf) { for (const f of alive(w, city)) if (f.id !== tf.id) { f.relations[tf.id] = clamp((f.relations[tf.id] ?? 0) - 30, -100, 100); tf.relations[f.id] = clamp((tf.relations[f.id] ?? 0) - 20, -100, 100); } tf.soldiers = Math.max(0, tf.soldiers - 2); } }
      break;
    case 'claim':
      for (const id of w.districts[p.districtId!]?.blockIds ?? []) { addInfluence(w, id, p.target!, 12); for (const f of alive(w, city)) if (f.id !== p.target) addInfluence(w, id, f.id, -6); }
      break;
    case 'seat':
      c.seated = true; pl.respect = clamp(pl.respect + 10);
      text += ' You have a seat. Your vote counts from the next meeting.';
      break;
  }
  // bosses remember which way you voted on their own business
  if (c.seated && c.vote && p.target && w.factions[p.target]) { const f = w.factions[p.target]; f.standing = clamp(f.standing + (c.vote === 'yes' ? 5 : -5), -100, 100); }
  c.history.unshift({ day: w.day, kind: p.kind, passed: t.passes, text });
  c.history = c.history.slice(0, 8);
  log(w, text, 'war');
  void fullName;
}
