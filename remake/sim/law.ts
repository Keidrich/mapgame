/**
 * Heat, the precincts, raids and case files.
 *
 * Two kinds of police trouble, kept apart because they feel different to play:
 *   - **Heat** is attention right now. It decays on its own, and past 60 it brings raids.
 *   - **A case file** is paper. It does not decay while anybody is still talking, and at 100
 *     evidence somebody is charged. You deal with it by dealing with the witnesses, the DA and
 *     the judge — not by waiting.
 */
import type { Rng } from './rng';
import type { Case, CaseCrime, Id, World } from './types';
import { PLAYER } from './types';
import { addHeat, clamp, fullName, log, money, nid } from './util';
import { injure, jail } from './people';
import { RACKETS } from '@r/content/world';
import { succeed } from './legacy';

export function openCase(w: World, crime: CaseCrime, suspect: Id | 'player', witnessId: Id | undefined, summary: string, evidence = 15): Case {
  // the same suspect and crime in the last fortnight thickens one file rather than opening two
  const same = Object.values(w.cases).find(c => c.status === 'open' && c.suspectId === suspect && c.crime === crime && w.day - c.opened < 14);
  if (same) { same.evidence = clamp(same.evidence + evidence * 0.8); if (witnessId && !same.witnessIds.includes(witnessId)) same.witnessIds.push(witnessId); return same; }
  const c: Case = { id: nid(w, 'case'), crime, opened: w.day, evidence, suspectId: suspect, witnessIds: witnessId ? [witnessId] : [], status: 'open', summary };
  w.cases[c.id] = c;
  log(w, `The police open a file: ${summary}`, 'law');
  return c;
}

export const openCases = (w: World) => Object.values(w.cases).filter(c => c.status === 'open' || c.status === 'charged');

/** Daily evidence growth on a file, as the UI shows it. */
export function evidenceRate(w: World, c: Case): number {
  const talking = c.witnessIds.filter(id => { const n = w.npcs[id]; return n?.alive && n.rel.fear < 45 && !n.traits.includes('quiet'); }).length;
  const da = Object.values(w.npcs).some(n => n.official === 'prosecutor' && n.payroll && n.alive);
  const base = 0.6 + talking * 1.6 + w.player.heat / 40;
  return Math.round(base * (da ? 0.66 : 1) * (w.player.lawyer ? 0.8 : 1) * 10) / 10;
}

export function tickLaw(w: World, rng: Rng) {
  const p = w.player;
  // ---- the files
  for (const c of Object.values(w.cases)) {
    if (c.status === 'open') {
      const rate = evidenceRate(w, c);
      c.evidence = clamp(c.evidence + rate);
      if (rate < 1 && w.day - c.opened > 25 && c.evidence < 60) { c.status = 'cold'; log(w, `The file on ${c.summary.toLowerCase()} goes cold.`, 'good'); continue; }
      if (c.evidence >= 100) {
        c.status = 'charged'; c.trialDay = w.day + 4;
        if (c.suspectId === PLAYER) log(w, `You are charged: ${c.summary} Trial in four days. Get a lawyer, get to the witnesses, or get to the judge.`, 'law');
        else { const n = w.npcs[c.suspectId]; if (n) { log(w, `${fullName(n)} is charged: ${c.summary}`, 'law'); jail(w, n.id, 15, 'charged'); } c.status = 'closed'; }
      }
    } else if (c.status === 'charged' && c.suspectId === PLAYER && c.trialDay !== undefined && w.day >= c.trialDay) {
      trial(w, c, rng);
    }
  }
  // ---- raids: past 60 heat the police come to what is yours
  const captainHelps = (districtId: Id) => Object.values(w.npcs).some(n => n.official === 'captain' && n.payroll && n.alive && n.precinctId === w.districts[districtId]?.precinctId);
  if (p.heat >= 100) bust(w, rng);
  else if (p.heat > 60 && rng.chance((p.heat - 60) / 120)) {
    const targets = p.racketIds.map(id => w.rackets[id]).filter(r => r && r.down === 0);
    if (targets.length) {
      const r = rng.pick(targets); const b = w.businesses[r.businessId];
      const district = w.blocks[b.blockId].districtId;
      if (captainHelps(district) && rng.chance(0.6)) log(w, `Your captain moves a raid on ${b.name} to next week, and then loses the paperwork.`, 'good');
      else {
        r.down = rng.int(2, 5);
        const loss = Math.round(Math.min(p.dirty, 300 + p.dirty * 0.08)); p.dirty -= loss;
        log(w, `Police raid the ${RACKETS[r.kind].label.toLowerCase()} at ${b.name}. Shut ${r.down} days${loss ? `, and ${money(loss)} seized` : ''}.`, 'law', { businessId: b.id });
        if (r.runnerId && rng.chance(0.35)) jail(w, r.runnerId, rng.int(5, 12), `picked up at ${b.name}`);
        p.heat = clamp(p.heat - 6);
      }
    }
  }
  // ---- cooling
  // every captain on the payroll takes a point and a half off a day: the precinct looks elsewhere
  const captains = Object.values(w.npcs).filter(n => n.official === 'captain' && n.payroll && n.alive).length;
  const decay = 2.5 + p.heat * 0.035 + captains * 1.5 + (p.lowDays > 0 ? 9 : 0);
  p.heat = clamp(p.heat - decay);
  for (const b of Object.values(w.blocks)) if (b.heat > 0) b.heat = clamp(b.heat - 2.5);
  for (const d of Object.values(w.districts)) {
    const toward = d.police + (captainHelps(d.id) ? -12 : 0);
    d.attention = clamp(d.attention + (toward - d.attention) * (captainHelps(d.id) ? 0.25 : 0.12));
  }
  // released
  for (const n of Object.values(w.npcs)) if (n.jailedDays) { n.jailedDays--; if (n.jailedDays <= 0) n.jailedDays = undefined; }
}

/** Heat hits 100: they come for you. Not the end — but it costs. */
function bust(w: World, rng: Rng) {
  const p = w.player;
  const seized = Math.round(p.dirty * 0.7);
  p.dirty -= seized; p.busts++;
  for (const k of Object.keys(p.stash) as (keyof typeof p.stash)[]) p.stash[k].n = Math.floor(p.stash[k].n * 0.4);
  const crew = p.crewIds.map(id => w.npcs[id]).filter(n => n?.alive && n.crew?.status !== 'jailed');
  for (const n of rng.shuffle(crew).slice(0, Math.ceil(crew.length / 3))) jail(w, n.id, rng.int(6, 14), 'swept up in the bust');
  p.heat = 45; p.ap = 0;
  openCase(w, 'racketeering', PLAYER, undefined, 'Racketeering: what they found when they came through your door.', 30);
  log(w, `They come through the door at five in the morning. ${money(seized)} seized, most of the stash gone, and you spend the day answering questions.`, 'law');
  addHeat(w, 0);
}

function trial(w: World, c: Case, rng: Rng) {
  const judge = Object.values(w.npcs).some(n => n.official === 'judge' && n.payroll && n.alive);
  const witnesses = c.witnessIds.filter(id => { const n = w.npcs[id]; return n?.alive && n.rel.fear < 60; }).length;
  const odds = convictionOdds(w, c);
  void judge; void witnesses;
  if (rng.float() < odds) {
    if (w.player.crewIds.length) {
      // somebody takes the fall if anybody will
      const fall = w.player.crewIds.map(id => w.npcs[id]).filter(n => n?.alive && n.crew && n.crew.loyalty >= 70 && n.crew.status !== 'jailed')[0];
      if (fall) {
        c.status = 'closed';
        jail(w, fall.id, 40, `took the fall for you at trial`);
        fall.crew!.loyalty = 100;
        w.player.respect = clamp(w.player.respect + 5);
        log(w, `${fullName(fall)} stands up in court and says it was them. The jury believes it. You walk out; they do not.`, 'law', { npcId: fall.id });
        return;
      }
    }
    c.status = 'closed';
    log(w, `Guilty.`, 'law');
    succeed(w, 'convicted', `Convicted: ${c.summary} The jury was out for an hour.`);
  } else {
    c.status = 'closed';
    w.player.respect = clamp(w.player.respect + 8);
    log(w, `Not guilty. You walk down the courthouse steps and everybody on ${w.city.name}'s streets hears about it by nightfall.`, 'good');
  }
}

/** The number the trial is rolled against, shown to the player before it happens. */
export function convictionOdds(w: World, c: Case): number {
  const judge = Object.values(w.npcs).some(n => n.official === 'judge' && n.payroll && n.alive);
  const witnesses = c.witnessIds.filter(id => { const n = w.npcs[id]; return n?.alive && n.rel.fear < 60; }).length;
  // A file with nobody willing to testify is paper and suspicion; juries want a face. The first
  // draft gave a witness-less racketeering file a third of a chance, and one bust ended games.
  let o = 0.12 + witnesses * 0.22 + (c.evidence >= 100 ? 0.08 : 0);
  if (w.player.lawyer) o -= 0.2;
  if (judge) o -= 0.25;
  return Math.max(0.03, Math.min(0.92, o));
}

export { injure };
