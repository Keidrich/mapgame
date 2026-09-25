/**
 * Regressions from playtesting on a phone: each test is a bug a player found, pinned so it stays
 * fixed. Keep the player's words in the test name.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch, newWorld, PLAYER, select, type World } from '@r/sim/index';
import { writeNews } from '@r/sim/news';
import { poss } from '@r/sim/util';
import { NIGHT, TEMPLATES } from '@r/sim/events';
import { Rng } from '@r/sim/rng';

afterEach(() => new Promise<void>(r => setTimeout(r, 0)));

const mk = (): World => newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' });
const tpl = (id: string) => TEMPLATES.find(t => t.id === id)!;

describe('cards that make sense', () => {
  it('"how do I have 0 heat and cops already asking for money": no patrolman without a place of yours and some heat', () => {
    const w = mk();
    expect(tpl('cop_taste').weight(w)).toBe(0);
    w.player.heat = 30;
    expect(tpl('cop_taste').weight(w)).toBe(0);
    const b = Object.values(w.businesses)[0];
    b.protection = { by: PLAYER, rate: 0.12, since: 1 };
    expect(tpl('cop_taste').weight(w)).toBeGreaterThan(0);
    const e = tpl('cop_taste').build(w, new Rng(1), {})!;
    expect(e.text).toContain(b.name);
  });

  it('no card offers to take away heat, fear or respect you do not have', () => {
    const w = mk();
    const b = Object.values(w.businesses)[0];
    b.protection = { by: PLAYER, rate: 0.12, since: 1 };
    w.player.heat = 15;   // enough to bring the patrolman, less than a lot of what paying him promises
    const e = tpl('cop_taste').build(w, new Rng(1), {})!;
    const pay = e.options.find(o => o.id === 'pay')!;
    const heat = pay.effects.find(x => x.k === 'heat') as { n: number } | undefined;
    expect(heat?.n ?? 0).toBeGreaterThanOrEqual(-15);
    w.player.heat = 0;
    const e0 = tpl('cop_taste').build(w, new Rng(1), {})!;
    expect(e0.options.find(o => o.id === 'pay')!.effects.some(x => x.k === 'heat')).toBe(false);
    expect(e0.options.find(o => o.id === 'pay')!.hint).not.toMatch(/heat/);
  });

  it('the same random card about the same person does not come round again within three weeks', () => {
    let w = mk();
    const seen: string[] = [];
    for (let d = 0; d < 40; d++) {
      w = dispatch(w, { type: 'end_day' });
      for (const e of w.events) seen.push(`${w.day}:${e.template}:${e.npcId ?? e.businessId ?? ''}`);
      w.events = [];
    }
    const byKey = new Map<string, number[]>();
    for (const s of seen) { const [day, ...k] = s.split(':'); const key = k.join(':'); byKey.set(key, [...(byKey.get(key) ?? []), Number(day)]); }
    for (const [key, days] of byKey) {
      if (/^(det|rep|heir|ven|tc|of|season)_|loan_due|expose|revenge_strike|payroll_lapses/.test(key)) continue;   // scheduled, not random
      for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1], key).toBeGreaterThanOrEqual(key.endsWith(':') ? 7 : 21);
    }
  });
});

describe('the second playtest', () => {
  it('"two blocks with the same name": every block in a city has its own', () => {
    for (const seed of [1, 7, 3, 11]) {
      const w = newWorld({ seed, size: 'medium', name: 'T', background: 'grifter' });
      const names = Object.values(w.blocks).map(b => b.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('"the tutorial rewrote a step I had done": a finished step says what was done', () => {
    const w = mk();
    const b = Object.values(w.businesses).find(x => x.tier === 1 && !x.protection)!;
    b.protection = { by: PLAYER, rate: 0.12, since: 1 } as never;
    const step = select.leads(w).find(l => l.id === 'protect')!;
    expect(step.done).toBe(true);
    expect(step.text).toBe(`Put ${b.name} under your protection`);
  });

  it('"Pull a job pointed at every offer": a job under way is the step, and a new one is not', () => {
    const w = mk();
    const job = Object.values(w.jobs)[0];
    if (!job) return;
    job.status = 'planning'; (job as { daysLeft: number }).daysLeft = 2;
    const step = select.leads(w).find(l => l.id === 'job')!;
    expect(step.text).toContain(job.title);
    expect(step.blocked).toMatch(/Planning: 2 days left/);
  });

  it('"a refused drink made the front page": a small bad day is not news', () => {
    const w = mk();
    const n = Object.values(w.npcs).find(x => x.alive && !x.crew)!;
    w.log.push({ day: w.day, text: `${select.fullName(n)} laughs at the offer.`, tone: 'bad', npcId: n.id });
    writeNews(w, new Rng(1), w.day);
    expect(w.news.at(-1)!.weight).toBe(0);
    w.log.push({ day: w.day, text: `${select.fullName(n)} is dead — shot.`, tone: 'bad', npcId: n.id });
    writeNews(w, new Rng(1), w.day);
    expect(w.news.at(-1)!.weight).toBeGreaterThan(0);
    expect(w.news.at(-1)!.blockId).toBe(n.homeBlockId);
  });

  it('"the Cassidys\'s soldiers": a plural name takes a bare apostrophe', () => {
    expect(poss('Cassidys')).toBe("Cassidys'");
    expect(poss('Rook')).toBe("Rook's");
  });
});

describe('the long run', () => {
  it('"seven places called The Sharp Edge": business names are unique in a city', () => {
    for (const seed of [1, 7, 3]) {
      const w = newWorld({ seed, size: 'medium', name: 'T', background: 'grifter' });
      const names = Object.values(w.businesses).map(b => b.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('"lent $2,800 and got $1,200 back": the loan comes back with the third on top', () => {
    const w = mk();
    const o = Object.values(w.npcs).find(n => n.alive && n.workId && !n.traits.includes('gambler') && !n.traits.includes('junkie'))!;
    const due = tpl('loan_due').build(w, new Rng(1), { npcId: o.id, businessId: o.workId, n: 2800 })!;
    const take = due.options.find(x => x.id === 'take')!;
    expect(take.effects.find(e => e.k === 'dirty')).toMatchObject({ n: Math.round(2800 * 4 / 3) });
  });

  it('"NIGHT OF TROUBLE five days running": the paper does not print the same headline twice in a row', () => {
    const w = mk();
    for (let d = 0; d < 6; d++) writeNews(w, new Rng(d), w.day);
    const texts = w.news.slice(-6).map(h => h.text);
    for (let i = 1; i < texts.length; i++) expect(texts[i]).not.toBe(texts[i - 1]);
  });
});

describe('soft-locks', () => {
  it('"the night would not end": a card a broke player cannot answer still has a way out', () => {
    const w = mk();
    w.player.cash = 0; w.player.dirty = 0;
    const t = NIGHT.find(x => x.id === 'night_cards')!;
    let e;
    for (let i = 0; i < 40 && !e; i++) { w.phase = 'night'; if (t.weight(w) > 0) e = t.build(w, new Rng(i), {}); w.player.blockId = Object.keys(w.blocks)[i * 3]; }
    expect(e).toBeDefined();
    if (!e) return;
    expect(e.options.some(o => !o.disabled)).toBe(true);
  });
});
