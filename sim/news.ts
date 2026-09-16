/**
 * What the city read about it afterwards.
 *
 * Built entirely out of `w.log`, which the game has been writing since the first day and which
 * nothing has ever read back at the player except as a scrolling list of what *they* did. A
 * headline is the same event seen from outside: it arrives a day or two late, it gets the details
 * slightly wrong on purpose, and it never says the player's name unless the city actually knows
 * it — which is what makes a front page feel earned rather than narrated.
 *
 * **No new tracking.** Every headline below is pattern-matched off a log line that already
 * existed for its own reasons. If a system stops logging something, its headline stops appearing,
 * which is the correct behaviour and not a bug to work around.
 */
import { LIFESTYLE } from '@content/fortune';
import type { LogEntry, World } from './types';

export interface Headline { day: number; text: string; tone: 'big' | 'normal' }

/** How long a story stays on the front page. */
const RUNS_FOR = 6;
/** How far behind the event the paper is. Nothing is news the morning it happens. */
const LAG = 1;

interface Rule { match: RegExp; tone?: 'big'; line: (m: RegExpMatchArray, w: World) => string }

/** "a forger", "an alarm man". The paper writes properly even when the game is being terse. */
const aOrAn = (s: string) => `${/^[AEIOU]/i.test(s) ? 'an' : 'a'} ${s.toLowerCase()}`;

/**
 * The paper's desk. Order matters only in that the first match wins, so the loudest rules go
 * first — a bust during a war is a bust, not a war story.
 */
const RULES: Rule[] = [
  { match: /^BUSTED\./, tone: 'big', line: () => 'TASK FORCE SWEEPS CITY IN DAWN RAIDS — "A significant disruption," says the commissioner, who declined to say of what.' },
  { match: /^RAID: police tossed (.+?) on/, line: m => `POLICE SEARCH PREMISES ON ${m[1].toUpperCase()} — no arrests reported, no comment offered.` },
  { match: /(.+?) are finished\./, tone: 'big', line: m => `THE END OF ${m[1].toUpperCase()} — a name that meant something for thirty years means nothing this morning.` },
  { match: /(.+?) and (.+?) are at war\./, tone: 'big', line: (m) => `${m[1].toUpperCase()} AND ${m[2].toUpperCase()}: CITY BRACED FOR A BAD SUMMER` },
  { match: /^Bank Job at (.+?):/, tone: 'big', line: m => `${m[1].toUpperCase()} ROBBED — police say the people who did it knew the building.` },
  { match: /^(Jewel Heist|Armored Car|Warehouse Job|The Count Room|Under the Dome) at (.+?):/, tone: 'big', line: m => `${m[2].toUpperCase()}: ${m[1].toUpperCase()} — "professional," says a detective who would not give his name.` },
  { match: /^(.+?) is finished\. Their blocks are up for grabs\./, line: m => `${m[1].toUpperCase()} DISSOLVES — nobody has claimed the corners yet.` },
  { match: /fire at (.+)/i, line: m => `FIRE AT ${m[1].toUpperCase().replace(/\.$/, '')} — cause not yet established.` },
  { match: /^(.+?) was shot/, tone: 'big', line: m => `${m[1].toUpperCase()} FOUND DEAD — police are "keeping an open mind".` },
  { match: /now pays you (\d+)%/, line: () => 'SHOPKEEPERS COMPLAIN OF "PROTECTION" ON SOUTH SIDE — nobody will say so on the record.' },
  { match: /^You put the first one down at (.+?) and/, line: m => `DISTURBANCE AT ${m[1].toUpperCase()} — two men treated at the scene; no charges.` },
  { match: /took the corner|have (.+?) now\. They did not have/, line: () => 'A NEW NAME ON THE SOUTH SIDE — "Nobody had heard of them a month ago," says a shop owner.' },

  // ---------------------------------------------------------------- the last two drops
  // Everything below matches a line some other system was already writing for its own reasons.
  // Nothing here tracks anything: if a system stops logging, its headline stops appearing.

  // The outfit changes hands. The paper cannot know what happened inside it, which is the point —
  // a succession reads from outside as a name on a door changing and nobody explaining why.
  {
    // `how` is a whole sentence supplied by the caller and ends in a full stop, so the heir's name
    // is whatever follows the last one. Matching on the sentence boundary rather than on the shape
    // of a name means a nickname in quotes — Rafaella "Hooks" Colombo — comes through whole.
    match: /(?:^|\. )([^.]+?) is what is left, and by the end of the week/,
    tone: 'big',
    line: m => `${m[1].toUpperCase()} IS THE NAME ON IT NOW — the corners have not changed hands, the man giving the orders has, and nobody downtown will say how.`,
  },
  // Going straight. From outside this is somebody who simply stopped, which is far more unusual
  // than getting killed and is reported as such.
  {
    match: /^You are out\. Whatever this was, it is somebody else's now\./,
    tone: 'big',
    line: () => 'HE WALKED AWAY — "Nobody walks away," says a retired detective who spent nine years on it. "He walked away."',
  },
  // A street name. The one headline that quotes the player's name, and it can only ever run when
  // the city has genuinely given them one — the log line is written by `earnStreetName` itself.
  {
    match: /they call you (.+?) now\./,
    tone: 'big',
    line: m => `WHO IS "${m[1].toUpperCase()}"? — a name that was not being said last month is being said on four blocks, and nobody will put it next to a face.`,
  },
  // Somebody good was seen with somebody they do not usually work for. The *hire*, not the night:
  // on a job the resolver already writes a robbery line, and first-match-wins means the robbery is
  // the story. This is the word going round beforehand, which is its own kind of news.
  {
    match: /is in on .+?\. (Safecracker|Wheelman|Inside Man|Alarm Man|The Face|Demolition Man|Forger|Lookout), one fee/,
    line: m => `A CREW IS BEING PUT TOGETHER — somebody has been asking after ${aOrAn(m[1])}, and people who know the trade have stopped returning calls.`,
  },
  // …and the night itself, for the jobs that have no robbery headline of their own. Placed after
  // every heist rule on purpose: on a bank job the bank is the story, not the safecracker.
  {
    match: /did exactly what \w+ was paid to do\./,
    line: () => 'A JOB THAT WENT TOO WELL — detectives are said to be "interested in the standard of the work" rather than in any one suspect.',
  },
  // Money turning into a life. The labels are read off `LIFESTYLE` rather than copied, so a rung
  // renamed in content cannot silently stop making news.
  {
    match: new RegExp(`^(${Object.values(LIFESTYLE).flat().map(s2 => s2.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\.`),
    line: m => `SOMEBODY IS DOING VERY WELL — ${m[1].toLowerCase()}, paid for in full, and the name on the paperwork means nothing to anybody at the registry.`,
  },
  // …and money turning into respectability, which is the same transaction told the other way up.
  {
    match: /to things with your name on them\./,
    line: () => 'A NEW BENEFACTOR — the cheque cleared, the plaque is ordered, and nobody on the committee asked a single question.',
  },

  // ---------------------------------------------------------------- wars that are not yours
  // A city with four outfits in it should read like a city with four outfits in it. All of these
  // come off `sim/factions.ts`, which has been logging them since the faction pass and which
  // nothing has ever reported: a war the player is nowhere near looked exactly like silence.
  {
    match: /^(.+?) have decided (.+?) are standing on something of theirs\./,
    tone: 'big',
    line: m => `${m[1].toUpperCase()} MOVE ON ${m[2].toUpperCase()} — nobody involved will say what started it and everybody involved says it is finished.`,
  },
  {
    match: /^(.+?) and (.+?) sat down and it held\./,
    line: m => `${m[1].toUpperCase()} AND ${m[2].toUpperCase()}: QUIET AGAIN — no arrests, no bodies, and no explanation offered for either.`,
  },
  {
    match: /^(.+?) and (.+?) are at beef\./,
    line: m => `BAD BLOOD BETWEEN ${m[1].toUpperCase()} AND ${m[2].toUpperCase()} — two incidents in a week, and the word from both sides is that it is nothing.`,
  },
  {
    match: /^(.+?) are gone\. (.+?) took what was left of them/,
    tone: 'big',
    line: m => `${m[2].toUpperCase()} SWALLOW ${m[1].toUpperCase()} — the same corners, the same earners, a different name collecting.`,
  },
  {
    match: /^(.+?) has bled out\./,
    line: m => `${m[1].toUpperCase()} FOLD — no soldiers, no money, and nobody answering the phone at the social club.`,
  },
  {
    match: /^(.+?) cannot make payroll\./,
    line: m => `TROUBLE INSIDE ${m[1].toUpperCase()} — men who were on the corner last month are looking for work this month.`,
  },
  {
    match: /^(.+?) has no boss\. (.+?) and (.+?) both want the chair/,
    tone: 'big',
    line: m => `WHO RUNS ${m[1].toUpperCase()}? — two names, a lot of young men choosing between them, and a fortnight to find out.`,
  },
];


/**
 * The front page, newest first.
 *
 * Reads the log backwards and stops at `limit` — a two-hundred-day save has a very long log and
 * this is called every time a screen renders.
 */
export function headlines(w: World, limit = 12): Headline[] {
  const out: Headline[] = [];
  const cutoff = w.day - RUNS_FOR * 4;
  for (let i = w.log.length - 1; i >= 0 && out.length < limit; i--) {
    const e: LogEntry = w.log[i];
    if (e.day < cutoff) break;
    if (e.day > w.day - LAG) continue;          // the paper is a day behind, always
    for (const r of RULES) {
      const m = e.text.match(r.match);
      if (!m) continue;
      const text = r.line(m, w);
      if (out.some(h => h.text === text)) break;  // one story runs once
      out.push({ day: e.day, text, tone: r.tone ?? 'normal' });
      break;
    }
  }
  return out;
}

/** Whether the paper has anything at all, for the screens that hide themselves when it does not. */
export const hasNews = (w: World): boolean => headlines(w, 1).length > 0;
