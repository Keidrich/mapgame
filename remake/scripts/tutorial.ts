/**
 * The tutorial run: a rookie who does only what the quest strip says.
 *
 * The quest line (`select.leads`) is the Remake's tutorial — the strip on the map that names the next
 * thing to do and points at a real person, place or tab. The soak bot plays well and so never shows
 * whether the strip itself can be followed. This one plays like somebody on their first evening: it
 * reads the top quest, goes where the strip's tap takes it, and presses the buttons that sheet
 * shows — nothing else. When the strip points at something it cannot act on, that is logged with
 * the game's own refusal, because that is exactly what a new player would be staring at.
 *
 * `npm run sim2 -- 40 7 medium grifter tutorial` prints, per quest, the day it came up, the day it
 * was done, and anything that stopped it. The test (`remake/tests/tutorial.test.ts`) holds the line:
 * every step before the long-game ones is done within a set number of days, on several seeds.
 */
import { BUSINESSES, RACKETS } from '@r/content/world';
import { can, dispatch, newWorld, select, PLAYER, type Action, type Background, type Id, type World } from '@r/sim/index';
import type { CitySize } from '@r/sim/city';
import type { Approach, RacketKind } from '@r/sim/types';

export interface StepLog { id: string; text: string; up?: number; done?: number; stuck: string[] }
export interface TutorialRun { w: World; steps: StepLog[]; actions: number; refusals: Record<string, number> }

/** The steps that are the tutorial proper; after these the strip is pointing at the long game. */
export const OPENING = ['talk', 'lean', 'protect', 'racket', 'crew', 'job', 'wash', 'safehouse', 'hold'];
/** Steps the rookie is taught too, but which take as long as they take (a recruit has to level up). */
export const MIDGAME = ['payroll', 'lieutenant'];

export function tutorial(opts: { days: number; seed: number; size?: CitySize; background?: Background }): TutorialRun {
  let w = newWorld({ seed: opts.seed, size: opts.size ?? 'medium', name: 'Rookie', background: opts.background ?? 'grifter' });
  const steps = new Map<string, StepLog>();
  const refusals: Record<string, number> = {};
  let actions = 0;
  const note = (id: string, why: string) => { const s = steps.get(id)!; if (!s.stuck.includes(why)) s.stuck.push(why); refusals[why] = (refusals[why] ?? 0) + 1; };
  const tryAct = (id: string, a: Action): boolean => {
    const ok = can(w, a);
    if (!ok.ok) { note(id, `${a.type}${a.type === 'scene' ? `:${a.kind}` : ''} — ${ok.why}`); return false; }
    w = dispatch(w, a); actions++;
    return true;
  };
  const answer = () => {
    // a rookie reads the card and takes the first answer they can afford
    for (let g = 0; g < 10; g++) {
      const j = select.pendingJob(w);
      if (j?.complication) { const o = j.complication.options[0]; w = dispatch(w, { type: 'answer', jobId: j.id, optionId: o.id }); continue; }
      const e = w.events[0]; if (!e) return;
      const o = e.options.find(x => !x.disabled) ?? e.options[e.options.length - 1];
      if (!can(w, { type: 'resolve_event', eventId: e.id, optionId: o.id }).ok) return;
      w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: o.id });
    }
  };
  const record = () => {
    for (const l of select.leads(w)) {
      const s = steps.get(l.id) ?? { id: l.id, text: l.text, stuck: [] };
      if (l.done && s.done === undefined) s.done = w.day;
      if (!l.done && l.blocked && !s.stuck.includes(`blocked: ${l.blocked}`)) s.stuck.push(`blocked: ${l.blocked}`);
      steps.set(l.id, s);
    }
    const top = select.nextLead(w);
    if (top) { const s = steps.get(top.id)!; if (s.up === undefined) s.up = w.day; s.text = top.text; }
  };
  /** The person sheet's "Go to" button, then a scene. */
  const scene = (id: string, npcId: Id, kind: select.SceneKind, extra: { businessId?: Id; rate?: number } = {}): boolean => {
    const n = w.npcs[npcId]; if (!n) return false;
    if (w.player.blockId !== n.homeBlockId && !tryAct(id, { type: 'travel', blockId: n.homeBlockId })) return false;
    return tryAct(id, { type: 'scene', kind, npcId, ...extra });
  };
  /** Whichever of talk or threat the sheet shows better odds for — what a rookie picks. */
  const warmUp = (id: string, npcId: Id): boolean => {
    const chat = select.quote(w, 'chat', npcId), scare = select.quote(w, 'intimidate', npcId);
    const n = w.npcs[npcId];
    const kind: select.SceneKind = n.rel.trust >= n.rel.fear ? (chat.disabled ? 'intimidate' : 'chat') : (scare.disabled || scare.chance < 50 ? 'chat' : 'intimidate');
    return scene(id, npcId, kind);
  };

  while (w.day <= opts.days && !w.over) {
    answer();
    record();
    let guard = 0;
    while (w.player.ap > 0 && guard++ < 12) {
      const l = select.nextLead(w);
      if (!l) break;
      const before = actions;
      step(l);
      // when the strip is waiting on money or a long-game step, a new player does what it has already
      // taught them — protect and lean on the places around them — rather than end the day at dawn
      if (actions === before) grind(l.id);
      answer();
      record();
      if (actions === before) break;   // nothing the strip taught can be done today
    }
    answer();
    w = dispatch(w, { type: 'end_day' });
  }
  record();
  return { w, steps: [...steps.values()], actions, refusals };

  function step(l: select.Lead) {
    const p = w.player;
    const id = l.id;
    switch (id) {
      case 'talk':
        if (!l.npcId) { note(id, 'the strip names nobody'); return; }
        scene(id, l.npcId, 'chat');
        return;
      case 'lean':
        if (!l.npcId) { note(id, 'the strip names nobody'); return; }
        warmUp(id, l.npcId);
        return;
      case 'protect': {
        if (!l.npcId) { note(id, 'the strip names nobody'); return; }
        const n = w.npcs[l.npcId]; const biz = n.workId ? w.businesses[n.workId] : undefined;
        if (!biz || biz.ownerId !== n.id) { note(id, `${select.fullName(n)} owns nothing the sheet can protect`); return; }
        const q = select.quote(w, 'protect', n.id, { businessId: biz.id, rate: 0.12 });
        if (q.disabled && !q.disabled.startsWith('Go to')) { note(id, `protect — ${q.disabled}`); warmUp(id, n.id); return; }
        if (q.chance < 35) { warmUp(id, n.id); return; }
        scene(id, n.id, 'protect', { businessId: biz.id, rate: 0.12 });
        return;
      }
      case 'racket': {
        if (!l.businessId) { note(id, 'the strip names no place'); return; }
        const b = w.businesses[l.businessId];
        // the business sheet lists the rackets the place allows; a rookie takes the cheapest they can afford
        const kinds = (BUSINESSES[b.type].rackets as RacketKind[]).slice().sort((a, k) => (select.racketWarning(w, a) ? 1e4 : 0) + RACKETS[a].setup - (select.racketWarning(w, k) ? 1e4 : 0) - RACKETS[k].setup);
        if (!kinds.length) { note(id, `${b.name} takes no racket at all`); return; }
        for (const k of kinds) if (can(w, { type: 'start_racket', businessId: b.id, kind: k }).ok) { tryAct(id, { type: 'start_racket', businessId: b.id, kind: k }); return; }
        tryAct(id, { type: 'start_racket', businessId: b.id, kind: kinds[0] });
        return;
      }
      case 'crew': {
        if (!l.npcId) { note(id, 'the strip names nobody to recruit'); return; }
        const q = select.quote(w, 'recruit', l.npcId);
        if (!q.disabled && q.chance >= 40) { scene(id, l.npcId, 'recruit'); return; }
        if (q.disabled && !q.disabled.startsWith('Go to') && !/trust/i.test(q.disabled)) note(id, `recruit — ${q.disabled}`);
        scene(id, l.npcId, 'chat');
        return;
      }
      case 'job': {
        // the Jobs tab: an offer, the crew the sheet pre-picks, then the best-looking approach
        const ready = Object.values(w.jobs).find(j => j.status === 'ready');
        if (ready) {
          const a = (['quiet', 'loud', 'clever'] as Approach[]).map(x => ({ x, c: select.jobOdds(w, ready, ready.crewIds, x).chance })).sort((m, n) => n.c - m.c)[0].x;
          tryAct(id, { type: 'launch_job', jobId: ready.id, approach: a });
          return;
        }
        if (Object.values(w.jobs).some(j => j.status === 'planning')) { note(id, 'waiting on a plan'); return; }
        const offers = Object.values(w.jobs).filter(j => j.status === 'offer').sort((a, b) => a.difficulty - b.difficulty);
        if (!offers.length) { note(id, 'the Jobs tab is empty'); return; }
        const free = select.crew(w).filter(n => n.crew!.status === 'ready' && !n.crew!.assignment).map(n => n.id);
        for (const j of offers) {
          const pick = free.slice(0, Math.max(j.crewMin, 0));
          if (can(w, { type: 'take_job', jobId: j.id, crewIds: pick }).ok) { tryAct(id, { type: 'take_job', jobId: j.id, crewIds: pick }); return; }
        }
        tryAct(id, { type: 'take_job', jobId: offers[0].id, crewIds: free.slice(0, offers[0].crewMin) });
        return;
      }
      case 'wash': {
        if (l.npcId) { scene(id, l.npcId, 'chat'); return; }
        const amt = Math.min(p.dirty, 1000, select.fixerCap(w) - p.washedToday);
        if (amt <= 0) { note(id, p.dirty <= 0 ? 'no dirty money to wash' : 'the fixer is full today'); return; }
        tryAct(id, { type: 'fixer_wash', amount: amt });
        return;
      }
      case 'safehouse':
        tryAct(id, { type: 'rent_safehouse', blockId: l.blockId ?? p.blockId });
        return;
      case 'payroll': {
        // the People tab lists the officials; a rookie tries the one with the best odds they can pay
        const best = select.officials(w).map(n => ({ n, q: select.quote(w, 'bribe', n.id) })).filter(x => !x.q.disabled || x.q.disabled.startsWith('Go to'))
          .sort((a, b) => b.q.chance - a.q.chance)[0];
        if (!best) { note(id, 'no official will take money'); return; }
        if (best.q.chance >= 40 && (best.q.cash ?? 0) <= p.cash + p.dirty) { scene(id, best.n.id, 'bribe'); return; }
        scene(id, best.n.id, 'chat');
        return;
      }
      case 'lieutenant': {
        const lt = select.crew(w).find(n => n.crew!.level >= 2 && n.crew!.loyalty >= 55 && n.crew!.status === 'ready' && n.crew!.assignment?.kind !== 'job');
        if (!lt) { note(id, 'nobody is ready'); return; }
        const ground = select.playerBlocks(w)[0] ?? w.blocks[p.blockId];
        tryAct(id, { type: 'assign', npcId: lt.id, assignment: { kind: 'district', districtId: ground.districtId } });
        return;
      }
      case 'hold':
        // no button says "hold a block": a rookie keeps doing what the strip taught them, here
        grind(id);
        return;
      default:
        note(id, 'past the opening');
    }
  }

  function grind(id: string) {
    const p = w.player;
    {
      {
        const here = w.blocks[p.blockId];
        const soft = select.businessesIn(w, here.id).filter(b => b.tier < 3 && b.protection?.by !== PLAYER && b.ownedBy !== PLAYER);
        for (const b of soft) {
          const q = select.quote(w, 'protect', b.ownerId, { businessId: b.id, rate: 0.12 });
          if (!q.disabled && q.chance >= 40) { tryAct(id, { type: 'scene', kind: 'protect', npcId: b.ownerId, businessId: b.id, rate: 0.12 }); return; }
        }
        for (const b of Object.values(w.businesses).filter(x => x.blockId === here.id && x.protection?.by === PLAYER)) {
          const k = (BUSINESSES[b.type].rackets as RacketKind[]).find(x => !select.racketWarning(w, x) && can(w, { type: 'start_racket', businessId: b.id, kind: x }).ok);
          if (k) { tryAct(id, { type: 'start_racket', businessId: b.id, kind: k }); return; }
        }
        const t = soft.map(b => b.ownerId).find(o => w.npcs[o]?.alive);
        if (t) { warmUp(id, t); return; }
        // this block is spent: walk to the next one with somebody to talk to, as anyone would
        const next = here.neighborIds.find(b => select.businessesIn(w, b).some(x => x.tier < 3 && x.protection?.by !== PLAYER && x.ownedBy !== PLAYER));
        if (next && tryAct(id, { type: 'travel', blockId: next })) return;
        if (id === 'hold') note(id, `nothing left to take on ${here.name}`);
      }
    }
  }
}
