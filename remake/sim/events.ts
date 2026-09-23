/**
 * The event deck, generated. A template looks at the world, picks real people and places to be
 * about, and writes its card from them — so "a crew member wants a raise" is *your* crew member,
 * asking for a number worked out from what they are actually paid.
 *
 * Every option is a list of `Effect`s, and its hint is written from that list (`effects.ts`).
 * Options never roll dice: an event is a decision with known consequences. The dice live in
 * jobs and scenes, where the odds are on the button.
 */
import { RACKETS } from '@r/content/world';
import { describe } from './effects';
import { stanceOf } from './factions';
import type { Rng } from './rng';
import type { Effect, GameEvent, Id, Npc, World } from './types';
import { PLAYER } from './types';
import { cap, fullName, money, nid, shortName, they, their, them, theName, vb } from './util';
import { agendaLine } from './scenes';
import { bedsTotal } from './select-core';

interface Ctx { npcId?: Id; businessId?: Id; factionId?: Id }
interface Template { id: string; weight: (w: World) => number; build: (w: World, rng: Rng, ctx: Ctx) => Omit<GameEvent, 'id' | 'template'> | undefined }

type Opt = { id: string; label: string; effects: Effect[]; disabled?: string };
const card = (w: World, title: string, text: string, opts: Opt[], refs: Partial<GameEvent> = {}) => ({
  title, text, ...refs,
  options: opts.map(o => ({ id: o.id, label: o.label, effects: o.effects, hint: describe(w, o.effects), disabled: o.disabled })),
});

const crew = (w: World) => w.player.crewIds.map(id => w.npcs[id]).filter((n): n is Npc => !!n?.alive && !!n.crew);
const afford = (w: World, n: number) => (w.player.cash + w.player.dirty >= n ? undefined : `You need ${money(n)}.`);
const affordDirty = (w: World, n: number) => (w.player.dirty >= n ? undefined : `You need ${money(n)} dirty.`);
const affordClean = (w: World, n: number) => (w.player.cash >= n ? undefined : `You need ${money(n)} clean.`);
/** Spend from dirty first, like everything else on the street. */
const pay = (w: World, n: number): Effect[] => { const d = Math.min(w.player.dirty, n); return [...(d ? [{ k: 'dirty', n: -d } as Effect] : []), ...(n - d ? [{ k: 'cash', n: -(n - d) } as Effect] : [])]; };

export const TEMPLATES: Template[] = [
  { id: 'crew_raise', weight: w => (crew(w).some(n => n.traits.includes('greedy') || n.traits.includes('ambitious')) ? 3 : 0),
    build: (w, rng) => {
      const n = rng.pick(crew(w).filter(x => x.traits.includes('greedy') || x.traits.includes('ambitious')));
      const more = Math.round(n.crew!.cut * 0.3 + 10);
      return card(w, `${shortName(n)} wants more`, `${fullName(n)} catches you after the count. "I'm worth more than ${money(n.crew!.cut)} a day. You know it and I know it." ${cap(they(n))} ${vb(n, 'want', 'wants')} ${money(more)} more.`, [
        { id: 'pay', label: `Pay it (+${money(more)}/day)`, effects: [{ k: 'cut', npcId: n.id, n: more }, { k: 'loyalty', npcId: n.id, n: 15 }] },
        { id: 'no', label: 'No', effects: [{ k: 'loyalty', npcId: n.id, n: -15 }] },
        { id: 'bonus', label: `A one-off bonus instead (${money(more * 5)})`, effects: [...pay(w, more * 5), { k: 'loyalty', npcId: n.id, n: 7 }], disabled: afford(w, more * 5) },
      ], { npcId: n.id });
    } },
  { id: 'owner_rate', weight: w => (Object.values(w.businesses).some(b => b.protection?.by === PLAYER && b.protection.rate > 0.15) ? 4 : 0),
    build: (w, rng) => {
      const b = rng.pick(Object.values(w.businesses).filter(x => x.protection?.by === PLAYER && x.protection.rate > 0.15));
      const o = w.npcs[b.ownerId];
      return card(w, `${b.name} cannot keep paying`, `${fullName(o)} shows you the books. At ${Math.round(b.protection!.rate * 100)}% ${they(o)} ${vb(o, 'are', 'is')} going under. ${cap(they(o))} ${vb(o, 'ask', 'asks')} for twelve.`, [
        { id: 'lower', label: 'Twelve it is', effects: [{ k: 'rate', businessId: b.id, n: 0.12 }, { k: 'trust', npcId: o.id, n: 15 }, { k: 'respect', n: 1 }] },
        { id: 'refuse', label: 'The rate is the rate', effects: [{ k: 'trust', npcId: o.id, n: -15 }, { k: 'npcFear', npcId: o.id, n: 10 }] },
      ], { npcId: o.id, businessId: b.id });
    } },
  { id: 'cop_taste', weight: w => (w.player.heat > 20 ? 3 : 1),
    build: (w, rng) => {
      const amt = Math.round((300 + w.player.heat * 12) / 50) * 50;
      const block = w.blocks[w.player.blockId];
      void rng;
      return card(w, 'A patrolman wants a taste', `A uniform leans on the counter on ${block.name}. "Nice little thing you've got going. Be a shame." ${money(amt)} and he forgets your face.`, [
        { id: 'pay', label: `Pay ${money(amt)}`, effects: [...pay(w, amt), { k: 'heat', n: -6 }], disabled: afford(w, amt) },
        { id: 'refuse', label: 'Tell him to walk his beat', effects: [{ k: 'heat', n: 7 }, { k: 'respect', n: 1 }] },
      ]);
    } },
  { id: 'rival_muscle', weight: w => (Object.values(w.factions).some(f => f.alive && (stanceOf(f, w.day) === 'tension' || stanceOf(f, w.day) === 'beef')) ? 4 : 0),
    build: (w, rng) => {
      const fs = Object.values(w.factions).filter(f => f.alive && ['tension', 'beef'].includes(stanceOf(f, w.day)));
      if (!fs.length) return undefined;
      const f = rng.pick(fs);
      const block = w.blocks[w.player.blockId];
      const toll = 400 + Math.round(Math.abs(f.standing) * 20 / 50) * 50;
      return card(w, `${f.short} soldiers on ${block.name}`, `Three soldiers from ${theName(f)} are leaning on a car across the street, watching your door. One of them waves.`, [
        { id: 'face', label: 'Walk over and face them', effects: [{ k: 'standing', factionId: f.id, n: -8 }, { k: 'respect', n: 4 }, { k: 'fear', n: 3 }, { k: 'heat', n: 3 }] },
        { id: 'pay', label: `Send over ${money(toll)} and a smile`, effects: [...pay(w, toll), { k: 'standing', factionId: f.id, n: 6 }, { k: 'respect', n: -2 }], disabled: afford(w, toll) },
        { id: 'ignore', label: 'Stay inside', effects: [{ k: 'influence', blockId: block.id, n: -8 }, { k: 'respect', n: -1 }] },
      ], { factionId: f.id });
    } },
  { id: 'witness', weight: w => (Object.values(w.cases).some(c => c.status === 'open' && c.witnessIds.some(id => w.npcs[id]?.alive)) ? 5 : 0),
    build: (w, rng) => {
      const c = rng.pick(Object.values(w.cases).filter(x => x.status === 'open' && x.witnessIds.some(id => w.npcs[id]?.alive)));
      const n = w.npcs[rng.pick(c.witnessIds.filter(id => w.npcs[id]?.alive))];
      const amt = Math.round((800 + n.wealth * 20) / 50) * 50;
      return card(w, 'A witness is talking', `${fullName(n)} has been seen going in and out of the precinct. The file — ${c.summary.toLowerCase()} — is getting thicker because of ${them(n)}.`, [
        { id: 'pay', label: `Pay ${them(n)} to forget (${money(amt)})`, effects: [...pay(w, amt), { k: 'npcFear', npcId: n.id, n: 25 }, { k: 'trust', npcId: n.id, n: 10 }, { k: 'evidence', caseId: c.id, n: -12 }], disabled: afford(w, amt) },
        { id: 'scare', label: 'Make sure they understand', effects: [{ k: 'npcFear', npcId: n.id, n: 45 }, { k: 'trust', npcId: n.id, n: -20 }, { k: 'heat', n: 5 }, { k: 'evidence', caseId: c.id, n: -6 }] },
        { id: 'leave', label: 'Leave it', effects: [{ k: 'evidence', caseId: c.id, n: 8 }] },
      ], { npcId: n.id });
    } },
  { id: 'someone_needs', weight: w => (Object.values(w.npcs).some(n => n.alive && n.rel.met && n.rel.trust >= 10 && n.agenda && !n.agenda.known) ? 3 : 0),
    build: (w, rng) => {
      const n = rng.pick(Object.values(w.npcs).filter(x => x.alive && x.rel.met && x.rel.trust >= 10 && x.agenda && !x.agenda.known));
      return card(w, `${shortName(n)} needs a word`, `${fullName(n)} finds you on the street and asks if you have a minute. ${cap(they(n))} ${vb(n, 'look', 'looks')} like ${they(n)} ${vb(n, 'have', 'has')} not slept.`, [
        { id: 'listen', label: 'Hear them out', effects: [{ k: 'agendaKnown', npcId: n.id }, { k: 'trust', npcId: n.id, n: 5 }] },
        { id: 'busy', label: 'Not now', effects: [{ k: 'trust', npcId: n.id, n: -5 }] },
      ], { npcId: n.id });
    } },
  { id: 'crew_family', weight: w => (crew(w).length ? 2 : 0),
    build: (w, rng) => {
      const n = rng.pick(crew(w));
      const amt = rng.int(6, 20) * 50;
      return card(w, `${shortName(n)}'s family`, `${fullName(n)}'s mother needs an operation, and the insurance says no. ${cap(they(n))} ${vb(n, 'have', 'has')} not asked you. ${cap(they(n))} ${vb(n, 'are', 'is')} not going to.`, [
        { id: 'pay', label: `Pay for it (${money(amt)})`, effects: [...pay(w, amt), { k: 'loyalty', npcId: n.id, n: 20 }, { k: 'respect', n: 1 }], disabled: afford(w, amt) },
        { id: 'no', label: 'It is not your business', effects: [{ k: 'loyalty', npcId: n.id, n: -6 }] },
      ], { npcId: n.id });
    } },
  { id: 'junkie_slip', weight: w => (crew(w).some(n => n.traits.includes('junkie')) && w.player.stash.goods.n + w.player.stash.pills.n > 5 ? 3 : 0),
    build: (w, rng) => {
      const n = rng.pick(crew(w).filter(x => x.traits.includes('junkie')));
      const prod = w.player.stash.pills.n > 5 ? 'pills' : 'goods';
      const lost = Math.min(w.player.stash[prod].n, rng.int(3, 8));
      return card(w, 'The stash is light', `${lost} lots of ${prod} are missing, and ${fullName(n)} has been sweating all week.`, [
        { id: 'forgive', label: 'One chance', effects: [{ k: 'product', product: prod, n: -lost }, { k: 'loyalty', npcId: n.id, n: 10 }] },
        { id: 'dock', label: 'Take it out of their pay', effects: [{ k: 'product', product: prod, n: -lost }, { k: 'loyalty', npcId: n.id, n: -12 }, { k: 'dirty', n: lost * 40 }] },
        { id: 'fire', label: 'Out. Today.', effects: [{ k: 'product', product: prod, n: -lost }, { k: 'fire', npcId: n.id }, { k: 'fear', n: 2 }] },
      ], { npcId: n.id });
    } },
  { id: 'journalist', weight: w => (w.player.heat > 35 || w.player.fear + w.player.respect > 60 ? 2 : 0),
    build: (w, rng) => {
      const paper = rng.pick(['the Courier', 'the Evening Standard', 'the Ledger', 'the Harbor Times']);
      return card(w, 'A reporter is asking questions', `Somebody from ${paper} has been showing your photograph around ${w.districts[w.blocks[w.player.blockId].districtId].name}.`, [
        { id: 'pay', label: 'Buy the story (1,500)', effects: [...pay(w, 1500), { k: 'heat', n: -8 }], disabled: afford(w, 1500) },
        { id: 'scare', label: 'Have a word with the editor', effects: [{ k: 'heat', n: 4 }, { k: 'fear', n: 3 }] },
        { id: 'ignore', label: 'Let them write it', effects: [{ k: 'schedule', template: 'expose', days: 3 }] },
      ]);
    } },
  { id: 'expose', weight: () => 0,
    build: w => card(w, 'Front page', `The piece runs. It gets most things right, including your name. Every precinct in ${w.city.name} reads it with their coffee.`, [
      { id: 'ok', label: 'Read it twice', effects: [{ k: 'heat', n: 12 }, { k: 'respect', n: 3 }, { k: 'fear', n: 3 }] },
    ]) },
  { id: 'tip_truck', weight: w => (Object.values(w.blocks).some(b => b.waterfront) ? 2 : 0),
    build: (w, rng) => {
      const b = rng.pick(Object.values(w.blocks).filter(x => x.waterfront));
      const src = Object.values(w.npcs).find(n => n.alive && n.rel.met && n.rel.trust >= 5 && !n.crew);
      return card(w, 'A truck with no escort', `${src ? fullName(src) : 'A voice on the phone'} says a truck full of electronics will sit unguarded near ${b.name} tomorrow night.`, [
        { id: 'take', label: 'Put it on the board', effects: [{ k: 'jobOffer', job: { kind: 'hijack', title: 'The unguarded truck', pitch: '', tier: 2, blockId: b.id, crewMin: 1, crewMax: 3, leans: ['wheels', 'muscle'], difficulty: 35, planDays: 0, expires: w.day + 3, payout: { dirty: 0, clean: 0, goods: 0, respect: 0, fear: 0 }, heat: 6, exposure: 0.2, status: 'offer', crewIds: [], daysLeft: 0, intel: 2, sourceId: src?.id } }] },
        { id: 'pass', label: 'Not worth it', effects: [] },
      ]);
    } },
  { id: 'faction_threat', weight: w => (Object.values(w.factions).some(f => f.alive && stanceOf(f, w.day) === 'beef') ? 3 : 0),
    build: (w, rng) => {
      const f = rng.pick(Object.values(w.factions).filter(x => x.alive && stanceOf(x, w.day) === 'beef'));
      const boss = w.npcs[f.bossId];
      const amt = Math.round((1500 + Math.abs(f.standing) * 60) / 100) * 100;
      return card(w, `A message from the ${f.short}`, `${boss ? fullName(boss) : 'Their boss'} sends a man with a sealed envelope. Inside, a photograph of your door, and a number: ${money(amt)}.`, [
        { id: 'pay', label: `Pay the ${money(amt)}`, effects: [...pay(w, amt), { k: 'standing', factionId: f.id, n: 18 }, { k: 'respect', n: -3 }], disabled: afford(w, amt) },
        { id: 'return', label: 'Send the envelope back, empty', effects: [{ k: 'standing', factionId: f.id, n: -10 }, { k: 'respect', n: 4 }, { k: 'fear', n: 2 }] },
      ], { factionId: f.id });
    } },
  { id: 'faction_offer', weight: w => (Object.values(w.factions).filter(f => f.alive && f.standing >= 0).length && Object.values(w.factions).filter(f => f.alive).length >= 2 ? 2 : 0),
    build: (w, rng) => {
      const friends = Object.values(w.factions).filter(f => f.alive && f.standing >= 0);
      const f = rng.pick(friends);
      const enemies = Object.values(w.factions).filter(o => o.alive && o.id !== f.id && (f.relations[o.id] ?? 0) < -10);
      if (!enemies.length) return undefined;
      const e = rng.pick(enemies);
      const home = w.districts[e.homeDistrictId];
      return card(w, `The ${f.short} have a proposal`, `${cap(theName(f))} want ${theName(e)} hurt, and would rather it was not their people doing it. They are offering friendship for a raid on the ${e.short}.`, [
        { id: 'yes', label: 'Take the work', effects: [{ k: 'standing', factionId: f.id, n: 10 }, { k: 'standing', factionId: e.id, n: -6 }, { k: 'jobOffer', job: { kind: 'raid', title: `Raid the ${e.short} for the ${f.short}`, pitch: '', tier: 2, blockId: rng.pick(home.blockIds), targetFaction: e.id, crewMin: 2, crewMax: 4, leans: ['muscle', 'wheels'], difficulty: 50, planDays: 1, expires: w.day + 6, payout: { dirty: 0, clean: 0, goods: 0, respect: 0, fear: 0 }, heat: 10, exposure: 0.3, status: 'offer', crewIds: [], daysLeft: 1, intel: 1 } }] },
        { id: 'no', label: 'Stay out of it', effects: [{ k: 'standing', factionId: f.id, n: -3 }] },
      ], { factionId: f.id });
    } },
  { id: 'loan', weight: w => (Object.values(w.businesses).some(b => (b.protection?.by === PLAYER || b.ownedBy === PLAYER)) ? 2 : 0),
    build: (w, rng) => {
      const b = rng.pick(Object.values(w.businesses).filter(x => x.protection?.by === PLAYER || x.ownedBy === PLAYER));
      const o = w.npcs[b.ownerId];
      const amt = rng.int(10, 30) * 100;
      return card(w, `${shortName(o)} needs a loan`, `${fullName(o)} of ${b.name} needs ${money(amt)} to cover a bad month. ${cap(they(o))} will pay back a third on top in a week.`, [
        { id: 'lend', label: `Lend ${money(amt)}`, effects: [...pay(w, amt), { k: 'trust', npcId: o.id, n: 10 }, { k: 'schedule', template: 'loan_due', days: 7, npcId: o.id, businessId: b.id }], disabled: afford(w, amt) },
        { id: 'no', label: 'Not a bank', effects: [{ k: 'trust', npcId: o.id, n: -5 }] },
      ], { npcId: o.id, businessId: b.id });
    } },
  { id: 'loan_due', weight: () => 0,
    build: (w, _rng, ctx) => {
      const o = ctx.npcId ? w.npcs[ctx.npcId] : undefined; if (!o?.alive) return undefined;
      const b = ctx.businessId ? w.businesses[ctx.businessId] : undefined;
      const amt = Math.round((b ? b.income * 12 : 2000) / 100) * 100;
      if (o.traits.includes('gambler') || o.traits.includes('junkie')) return card(w, `${shortName(o)} cannot pay`, `The week is up. ${fullName(o)} has nothing — it went where ${their(o)} money always goes.`, [
        { id: 'forgive', label: 'Forgive it', effects: [{ k: 'trust', npcId: o.id, n: 25 }, { k: 'owes', npcId: o.id, n: 1 }, { k: 'respect', n: 2 }] },
        { id: 'lean', label: 'Remind them what they owe', effects: [{ k: 'npcFear', npcId: o.id, n: 30 }, { k: 'trust', npcId: o.id, n: -20 }, { k: 'fear', n: 2 }, { k: 'owes', npcId: o.id, n: 1 }] },
      ], { npcId: o.id });
      return card(w, `${shortName(o)} pays you back`, `${fullName(o)} comes by with an envelope and a handshake. Every dollar, and the third on top.`, [
        { id: 'take', label: 'Take it', effects: [{ k: 'dirty', n: amt }, { k: 'trust', npcId: o.id, n: 5 }] },
      ], { npcId: o.id });
    } },
  { id: 'informant', weight: w => (w.player.heat > 40 && crew(w).some(n => n.secret?.kind === 'informant' && !n.secret.known) ? 4 : 0),
    build: (w, rng) => {
      const n = rng.pick(crew(w).filter(x => x.secret?.kind === 'informant' && !x.secret.known));
      return card(w, 'Somebody is talking', 'The police knew about the last two things before they happened. Somebody close to you has a detective\'s number.', [
        { id: 'dig', label: 'Find out who', effects: [{ k: 'secretKnown', npcId: n.id }, { k: 'log', text: `It is ${fullName(n)}.`, tone: 'bad' }] },
        { id: 'feed', label: 'Feed them nothing for a while', effects: [{ k: 'heat', n: -5 }, { k: 'loyalty', npcId: n.id, n: -5 }] },
      ], { npcId: n.id });
    } },
  { id: 'newcomers', weight: w => (w.day > 5 ? 1.5 : 0),
    build: (w, rng) => {
      const here = w.blocks[w.player.blockId];
      const pool = Object.values(w.npcs).filter(n => n.alive && !n.crew && !n.faction && !n.official && n.role === 'patron' && (n.homeBlockId === here.id || here.neighborIds.includes(n.homeBlockId)));
      if (!pool.length) return undefined;
      const lead = rng.pick(pool);
      return card(w, 'New kids on the corner', `${fullName(lead)} and a few friends have started selling on a corner near ${here.name}. They are not asking anybody's permission.`, [
        { id: 'run', label: 'Run them off', effects: [{ k: 'fear', n: 3 }, { k: 'heat', n: 3 }, { k: 'npcFear', npcId: lead.id, n: 30 }, { k: 'influence', blockId: here.id, n: 4 }] },
        { id: 'hire', label: `Hire ${fullName(lead)}`, effects: [{ k: 'recruit', npcId: lead.id }], disabled: w.player.crewIds.length >= bedsTotal(w) ? 'No beds. Rent or upgrade a safehouse.' : undefined },
        { id: 'tax', label: 'Let them work, for a cut', effects: [{ k: 'dirty', n: 300 }, { k: 'trust', npcId: lead.id, n: 10 }] },
      ], { npcId: lead.id });
    } },
  { id: 'festival', weight: w => (w.player.businessIds.length + Object.values(w.businesses).filter(b => b.protection?.by === PLAYER).length >= 3 ? 1.5 : 0),
    build: (w, rng) => {
      const b = rng.pick(Object.values(w.blocks).filter(x => (x.influence[PLAYER] ?? 0) >= 30));
      if (!b) return undefined;
      return card(w, 'A street festival', `${b.name} is putting on a festival for the saint's day. Somebody has to pay for the band.`, [
        { id: 'pay', label: 'Pay for everything (1,000)', effects: [...pay(w, 1000), { k: 'respect', n: 5 }, { k: 'influence', blockId: b.id, n: 10 }], disabled: afford(w, 1000) },
        { id: 'skip', label: 'Let somebody else', effects: [] },
      ]);
    } },
  { id: 'hospital', weight: w => (crew(w).some(n => n.crew!.status === 'injured' && n.crew!.statusDays >= 3) ? 3 : 0),
    build: (w, rng) => {
      const n = rng.pick(crew(w).filter(x => x.crew!.status === 'injured' && x.crew!.statusDays >= 3));
      return card(w, 'A doctor who does not ask', `There is a doctor on the docks who treats people without writing anything down. ${fullName(n)} could be on ${their(n)} feet tomorrow.`, [
        { id: 'pay', label: 'Pay the doctor (600)', effects: [...pay(w, 600), { k: 'heal', npcId: n.id }, { k: 'loyalty', npcId: n.id, n: 8 }], disabled: afford(w, 600) },
        { id: 'wait', label: 'Let it heal', effects: [] },
      ], { npcId: n.id });
    } },
  { id: 'blood', weight: w => (Object.values(w.npcs).some(n => n.alive && n.agenda?.kind === 'revenge' && !n.agenda.targetId) ? 4 : 0),
    build: (w, rng) => {
      const n = rng.pick(Object.values(w.npcs).filter(x => x.alive && x.agenda?.kind === 'revenge' && !x.agenda.targetId));
      const amt = 2000;
      return card(w, 'Somebody wants blood', `${fullName(n)} lost somebody because of you, and has been telling anyone who will listen what ${they(n)} ${vb(n, 'are', 'is')} going to do about it.`, [
        { id: 'pay', label: `Blood money (${money(amt)})`, effects: [...pay(w, amt), { k: 'trust', npcId: n.id, n: 30 }, { k: 'log', text: `${fullName(n)} takes the money. It does not make anything right.`, tone: 'info' }], disabled: afford(w, amt) },
        { id: 'scare', label: 'Make them think again', effects: [{ k: 'npcFear', npcId: n.id, n: 40 }, { k: 'heat', n: 3 }] },
        { id: 'ignore', label: 'Let them talk', effects: [{ k: 'schedule', template: 'revenge_strike', days: 4, npcId: n.id }] },
      ], { npcId: n.id });
    } },
  { id: 'revenge_strike', weight: () => 0,
    build: (w, rng, ctx) => {
      const n = ctx.npcId ? w.npcs[ctx.npcId] : undefined; if (!n?.alive || n.rel.fear > 50) return undefined;
      const target = crew(w).filter(x => x.crew!.status !== 'jailed');
      if (!target.length) return undefined;
      const t = rng.pick(target);
      return card(w, 'They meant it', `${fullName(n)} was waiting outside ${fullName(t)}'s building with a length of pipe.`, [
        { id: 'ok', label: 'Get them to a hospital', effects: [{ k: 'injure', npcId: t.id, days: 5 }, { k: 'openCase', crime: 'violence', suspect: n.id, summary: `${fullName(n)} assaulted one of yours.` }] },
      ], { npcId: n.id });
    } },
  { id: 'payroll_lapses', weight: () => 0,
    build: (w, _rng, ctx) => {
      const n = ctx.npcId ? w.npcs[ctx.npcId] : undefined; if (!n?.alive || !n.official) return undefined;
      const weekly = 1500;
      return card(w, `${shortName(n)} wants paying`, `A month of favours on the strength of what you know is up. ${fullName(n)} would like the arrangement put on a regular footing, or ended.`, [
        { id: 'pay', label: `Pay ${money(weekly)} a week`, effects: [{ k: 'payroll', npcId: n.id, n: weekly }] },
        { id: 'end', label: 'End it', effects: [{ k: 'payroll', npcId: n.id, n: 0 }] },
      ], { npcId: n.id });
    } },
  { id: 'light_books', weight: w => (Object.values(w.npcs).some(n => n.alive && (n.crew?.skimmed ?? 0) > 1200) ? 3 : 0),
    build: (w, rng) => {
      const n = rng.pick(Object.values(w.npcs).filter(x => x.alive && (x.crew?.skimmed ?? 0) > 1200));
      const d = n.crew?.assignment?.kind === 'district' ? w.districts[n.crew.assignment.districtId].name : 'the district';
      return card(w, 'The books feel light', `The take from ${d} has been coming in a little under what it should, week after week. ${fullName(n)} runs ${d}.`, [
        { id: 'word', label: `Have a word with ${shortName(n)}`, effects: [{ k: 'caught', npcId: n.id }, { k: 'fear', n: 1 }] },
        { id: 'let', label: 'Let it go — everybody takes a little', effects: [{ k: 'loyalty', npcId: n.id, n: 4 }] },
      ], { npcId: n.id });
    } },
  { id: 'lucky', weight: w => (crew(w).length ? 1 : 0),
    build: (w, rng) => {
      const n = rng.pick(crew(w));
      const g = rng.int(4, 12);
      return card(w, 'Fell off a truck', `${fullName(n)} turns up with a van full of boxes and a story nobody believes.`, [
        { id: 'take', label: 'Into the stash', effects: [{ k: 'goods', n: g }, { k: 'heat', n: 2 }] },
        { id: 'return', label: 'Take it back where it came from', effects: [{ k: 'respect', n: 2 }, { k: 'loyalty', npcId: n.id, n: -4 }] },
      ], { npcId: n.id });
    } },
  { id: 'bulk_wash', weight: w => (w.fixerId && w.player.dirty > 5000 ? 2 : 0),
    build: (w, rng) => {
      const f = w.npcs[w.fixerId!]; if (!f?.alive) return undefined;
      const amt = Math.min(w.player.dirty, rng.int(5, 15) * 1000);
      return card(w, 'A one-time offer', `${fullName(f)} has a buyer for a car dealership that needs its books filled. ${money(amt)} dirty goes in, sixty cents on the dollar comes out clean. Once.`, [
        { id: 'yes', label: `Wash ${money(amt)}`, effects: [{ k: 'dirty', n: -amt }, { k: 'cash', n: Math.round(amt * 0.6) }], disabled: affordDirty(w, amt) },
        { id: 'no', label: 'Too expensive', effects: [] },
      ], { npcId: f.id });
    } },
  { id: 'inspector', weight: w => (w.player.businessIds.length ? 2 : 0),
    build: (w, rng) => {
      const b = w.businesses[rng.pick(w.player.businessIds)]; if (!b) return undefined;
      const r = b.racketIds.find(id => w.rackets[id]);
      return card(w, 'The city inspector', `An inspector from city hall has found forty things wrong with ${b.name}, and suggests there might be a way to find fewer.`, [
        { id: 'pay', label: 'Find fewer (500 clean)', effects: [{ k: 'cash', n: -500 }], disabled: affordClean(w, 500) },
        { id: 'fight', label: 'Make them do their job', effects: [...(r ? [{ k: 'racketDown', racketId: r, days: 3 } as Effect] : []), { k: 'heat', n: 2 }] },
      ], { businessId: b.id });
    } },
  { id: 'demand', weight: w => (w.player.stash.booze.n + w.player.stash.green.n + w.player.stash.pills.n > 20 ? 2 : 0),
    build: (w, rng) => {
      const prods = (['booze', 'green', 'pills'] as const).filter(p => w.player.stash[p].n >= 10);
      if (!prods.length) return undefined;
      const prod = rng.pick(prods);
      const n = Math.min(w.player.stash[prod].n, rng.int(10, 25));
      const price = { booze: 45, green: 80, pills: 160 }[prod];
      return card(w, 'A buyer from out of town', `Somebody passing through wants ${n} lots of ${prod}, cash, tonight, no haggling.`, [
        { id: 'sell', label: `Sell for ${money(n * price)}`, effects: [{ k: 'product', product: prod, n: -n }, { k: 'dirty', n: n * price }, { k: 'heat', n: 3 }] },
        { id: 'no', label: 'Do not know them', effects: [] },
      ]);
    } },
  { id: 'rival_racket', weight: w => (w.player.racketIds.length >= 2 ? 1.5 : 0),
    build: (w, rng) => {
      const r = w.rackets[rng.pick(w.player.racketIds)]; if (!r) return undefined;
      const b = w.businesses[r.businessId];
      return card(w, 'Competition', `Somebody has opened a copy of your ${RACKETS[r.kind].label.toLowerCase()} two doors down from ${b.name}, and is undercutting you.`, [
        { id: 'lean', label: 'Close them down', effects: [{ k: 'fear', n: 2 }, { k: 'heat', n: 4 }] },
        { id: 'live', label: 'Live with it', effects: [{ k: 'racketDown', racketId: r.id, days: 2 }] },
      ]);
    } },
];

const BY_ID = Object.fromEntries(TEMPLATES.map(t => [t.id, t]));

export function drawEvents(w: World, rng: Rng) {
  // scheduled ones first: they are consequences, and consequences arrive on time
  const due = w.scheduled.filter(s => s.day <= w.day);
  w.scheduled = w.scheduled.filter(s => s.day > w.day);
  for (const s of due) {
    const t = BY_ID[s.template]; if (!t) continue;
    const e = t.build(w, rng, s); if (e) w.events.push({ id: nid(w, 'e'), template: t.id, ...e });
  }
  if (w.events.length >= 2 || !rng.chance(0.62)) return;
  const pool = TEMPLATES.map(t => ({ item: t, w: t.weight(w) })).filter(x => x.w > 0 && !w.events.some(e => e.template === x.item.id));
  if (!pool.length) return;
  const t = rng.weighted(pool);
  const e = t.build(w, rng, {});
  if (e) w.events.push({ id: nid(w, 'e'), template: t.id, ...e });
}

export { agendaLine };
