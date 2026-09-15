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
import type { LogEntry, World } from './types';

export interface Headline { day: number; text: string; tone: 'big' | 'normal' }

/** How long a story stays on the front page. */
const RUNS_FOR = 6;
/** How far behind the event the paper is. Nothing is news the morning it happens. */
const LAG = 1;

interface Rule { match: RegExp; tone?: 'big'; line: (m: RegExpMatchArray, w: World) => string }

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
