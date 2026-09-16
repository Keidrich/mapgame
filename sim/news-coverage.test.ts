/**
 * Everything the last two drops taught the game to log, the paper now reads back.
 *
 * `sim/news.ts` is built on one promise: **no new tracking**. Every headline is pattern-matched off
 * a log line some other system was already writing for its own reasons. The cost of that promise is
 * that a rule and the line it matches live in different files and drift silently — a system tweaks
 * its wording, the regex stops matching, and the only symptom is a front page that is quieter than
 * it should be. Nothing throws and no test fails.
 *
 * So these do not assert on regexes. Each one **makes the event actually happen**, through the
 * reducer or the tick where it can, and then asks the front page what it says. If somebody rewrites
 * a log line, this is what notices.
 */
import { describe, expect, it } from 'vitest';
import { LIFESTYLE } from '@content/fortune';
import { SPECIALISTS } from '@content/specialists';
import { dispatch, generateWorld, select, type Npc, type World } from './index';
import { headlines } from './news';
import { earnStreetName } from './nemesis';
import { GO_STRAIGHT, goStraightReason, succeed } from './legacy';
import { tickGoStraight } from './legacy';

const mk = (seed = 12): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });
  w.pendingEvents = []; w.day = 40;
  return w;
};
/** What the paper says today about everything logged up to yesterday. */
const front = (w: World) => headlines({ ...w, day: w.day + 1 }, 40).map(h => h.text).join('\n');
/** Put a line straight in the log, for the handful of events a test cannot stage cheaply. */
const logged = (w: World, text: string): World => ({ ...w, log: [...w.log, { day: w.day, text, tone: 'info' as const }] });

function crew(w: World, n: number): Npc[] {
  const out: Npc[] = [];
  for (const p of Object.values(w.npcs).filter(x => x.alive && !x.crew && !x.official).slice(0, n)) {
    p.crew = { loyalty: 80, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
    p.role = 'crew'; w.player.crewIds.push(p.id); out.push(p);
  }
  return out;
}

describe('the outfit changing hands', () => {
  it('makes the front page, and names the heir rather than the man who went', () => {
    const w = mk();
    crew(w, 3);
    succeed(w, 'Somebody got to you, and there was nobody between you and them.');
    const page = front(w);
    expect(page).toMatch(/IS THE NAME ON IT NOW/);
    // The heir is whoever `heirs()` ranked first, and after a succession the player *is* them —
    // so this reads the answer off the world rather than guessing which crew member it would be.
    expect(page).toContain(w.player.name.toUpperCase());
    // …and not the `how` clause, which is the sentence in front of the name in the same log line.
    expect(page).not.toMatch(/SOMEBODY GOT TO YOU/);
  });
});

describe('the clean ending', () => {
  it('is reported as the unusual thing it is', () => {
    // Driven through `tickGoStraight` rather than by pasting its log line here: a test that writes
    // the string it is checking for proves only that the regex matches itself. This one fails the
    // day somebody rewords the ending, which is the entire point of the file.
    const w = mk();
    // Every condition `goStraightReason` asks for, set through the fields it reads — clean money,
    // nothing dirty, nobody looking, respectable, and somebody to do it for.
    w.player.cash = GO_STRAIGHT.cash + 50_000;
    w.player.dirty = 0; w.player.heat = 0;
    w.player.legitimacy = GO_STRAIGHT.legitimacy + 10;
    if (!w.player.lovedId) w.player.lovedId = Object.values(w.npcs).find(n => n.alive)!.id;
    expect(goStraightReason(w), 'the run could not have gone straight at all').toBeUndefined();
    w.player.cleanSince = GO_STRAIGHT.days - 1;
    tickGoStraight(w);
    expect(w.gameOver?.reason, 'the run did not actually end clean').toBe('straight');
    expect(front(w)).toMatch(/HE WALKED AWAY/);
  });
});

describe('a street name', () => {
  it('runs as a headline the moment the city starts saying it', () => {
    const w = mk();
    w.player.fear = 80; w.player.respect = 20;
    earnStreetName(w);
    expect(w.player.street, 'the name was never earned').toBeTruthy();
    const page = front(w);
    expect(page).toMatch(/WHO IS "/);
    expect(page).toContain(w.player.street!.toUpperCase());
  });
});

describe('a specialist', () => {
  it('is news when somebody good is being asked after', () => {
    // Matched off the *hire* line rather than the night: the resolver already writes a robbery
    // headline for the job itself, first match wins, and on a bank job the bank is the story.
    const w = mk();
    const n = Object.values(w.npcs).find(x => x.alive && !x.crew)!;
    const page = front(logged(w, `${n.name} is in on Bank Job. ${SPECIALISTS.forger.label}, one fee, and they do not want to know anything else.`));
    expect(page).toMatch(/A CREW IS BEING PUT TOGETHER/);
    expect(page).toMatch(/asking after a forger/);
  });

  it('and every role on the bench can be the one being asked after', () => {
    const w = mk();
    for (const def of Object.values(SPECIALISTS)) {
      const page = front(logged(w, `Somebody is in on Bank Job. ${def.label}, one fee, and they do not want to know anything else.`));
      expect(page, def.label).toMatch(/A CREW IS BEING PUT TOGETHER/);
    }
  });

  it('…and a night that turned on one gets its own story when the job has no headline of its own', () => {
    const w = logged(mk(), 'Marlene Vaughn did exactly what Marlene was paid to do.');
    expect(front(w)).toMatch(/A JOB THAT WENT TOO WELL/);
  });
});

describe('money turning into a life', () => {
  it('reports every rung of every ladder, because the rules are built from the table', () => {
    // The regex is composed from `LIFESTYLE` itself rather than copied out of it, so a rung renamed
    // in content cannot quietly stop making news. This asserts that property by walking the table.
    const w = mk();
    for (const step of Object.values(LIFESTYLE).flat()) {
      expect(front(logged(w, `${step.label}. ${step.blurb}`)), step.label).toMatch(/SOMEBODY IS DOING VERY WELL/);
    }
  });

  it('and reports buying respectability, through the reducer that does it', () => {
    const w = mk();
    w.player.cash = 500_000;
    const next = dispatch(w, { type: 'buy_legitimacy', amount: 120_000 });
    expect(front(next)).toMatch(/A NEW BENEFACTOR/);
  });

  it('and buying a rung, through the reducer that does that', () => {
    const w = mk();
    w.player.cash = 2_000_000;
    const next = dispatch(w, { type: 'buy_lifestyle', kind: 'car' });
    expect(front(next)).toMatch(/SOMEBODY IS DOING VERY WELL/);
  });
});

describe('wars that are not yours', () => {
  const two = (w: World) => Object.values(w.factions).slice(0, 2);

  it('reports one outfit moving on another with the player nowhere near it', () => {
    const w = mk(); const [a, b] = two(w);
    const page = front(logged(w, `${a.name} have decided ${b.short} are standing on something of theirs. Nobody asked the player's opinion.`));
    expect(page).toMatch(/MOVE ON/);
    expect(page).toContain(a.name.toUpperCase());
  });

  it('reports a truce nobody brokered', () => {
    const w = mk(); const [a, b] = two(w);
    expect(front(logged(w, `${a.short} and ${b.short} sat down and it held. Whatever that was about, it is over.`))).toMatch(/QUIET AGAIN/);
  });

  it('reports bad blood short of a war, which had no rule at all before', () => {
    const w = mk(); const [a, b] = two(w);
    // `are at war.` already had one; `are at beef.` is the same log line one rung down and was
    // going nowhere, so half of the stance ladder was invisible.
    expect(front(logged(w, `${a.name} and ${b.name} are at beef. Their blocks will be a mess for a while.`))).toMatch(/BAD BLOOD BETWEEN/);
    expect(front(logged(w, `${a.name} and ${b.name} are at war. Their blocks will be a mess for a while.`))).toMatch(/CITY BRACED/);
  });

  it('reports one outfit swallowing another', () => {
    const w = mk(); const [a, b] = two(w);
    const page = front(logged(w, `${a.name} are gone. ${b.name} took what was left of them — the corners, the earners and the people — and nobody needed the player's help to do it.`));
    expect(page).toMatch(/SWALLOW/);
  });

  it('reports an outfit running out of money, and an outfit running out of boss', () => {
    const w = mk(); const [a, b] = two(w);
    expect(front(logged(w, `${a.name} cannot make payroll. A soldier walks.`))).toMatch(/TROUBLE INSIDE/);
    expect(front(logged(w, `${a.name} has bled out.`))).toMatch(/FOLD/);
    const n = Object.values(w.npcs)[0], n2 = Object.values(w.npcs)[1];
    expect(front(logged(w, `${b.name} has no boss. ${n.name} and ${n2.name} both want the chair, and the soldiers are picking sides. It settles in 5 days.`))).toMatch(/WHO RUNS/);
  });
});

describe('the paper itself', () => {
  it('still runs one story once, however many times the log says it', () => {
    let w = mk();
    for (let i = 0; i < 4; i++) w = logged(w, 'A decent apartment. An address you can give people without watching their face.');
    expect(front(w).match(/SOMEBODY IS DOING VERY WELL/g)).toHaveLength(1);
  });

  it('is still a day behind everything', () => {
    const w = mk();
    w.player.fear = 80;
    earnStreetName(w);
    expect(headlines(w, 20).map(h => h.text).join('\n'), 'today’s news ran today').not.toMatch(/WHO IS "/);
    expect(front(w)).toMatch(/WHO IS "/);
  });

  it('has something to say about a city nobody touched', () => {
    // The end-to-end claim, and the one that matters most for the faction rules: **the player does
    // nothing at all**, for eighty days, and the paper still has a front page. A rules table that
    // only matched hand-written strings would pass every test above and this one nothing.
    //
    // From day 1 rather than day 40, because the paper only runs the last `RUNS_FOR * 4` days and a
    // world fast-forwarded past its own news has none left to print.
    let w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed: 3 });
    w.pendingEvents = [];
    for (let i = 0; i < 80; i++) { w = dispatch(w, { type: 'end_day' }); w.pendingEvents = []; }
    expect(select.hasNews(w), 'eighty days of a living city made no news at all').toBe(true);
    // …and what it is printing is the city's own business, not the player's, because the player
    // has not had any. Before this pass every one of these lines went nowhere.
    const page = headlines(w, 20).map(h => h.text).join('\n');
    expect(page).toMatch(/MOVE ON|QUIET AGAIN|BAD BLOOD|SWALLOW|FOLD|TROUBLE INSIDE|WHO RUNS|THE END OF|DISSOLVES|CITY BRACED/);
  });
});
