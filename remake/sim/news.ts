/**
 * The morning paper. Each day's log is scored and the loudest thing becomes a headline, written
 * in a tabloid register from templates keyed by what kind of thing it was, filled from the log
 * entry's *references* (a district, a place, a person) — never by chopping up the log sentence,
 * which is what the first draft did and how it printed "POLICE MOVE ON LEILA FAHMY CALLS YOUR BLUFF".
 */
import type { Rng } from './rng';
import type { LogEntry, World } from './types';

/**
 * What makes the paper, and how it is written up. Read from what happened, not from the log's tone:
 * by tone alone somebody turning down a drink ('bad') printed "{D} FAMILY GRIEVES", and hiring a
 * lawyer ('law') printed "POLICE MOVE IN" (found in play). First match wins; nothing matching, the
 * paper runs a quiet story.
 */
const DESK: { re: RegExp; tone?: string; weight: number; lines: string[] }[] = [
  { re: /\b(dead|killed|murder|shot|shots|not coming home|never comes home|body)\b/i, weight: 9, lines: ['BODY FOUND IN {D}', 'SHOTS FIRED IN {D}', 'MURDER IN {D} — POLICE BAFFLED', '{D} IN SHOCK AFTER KILLING'] },
  { re: /\b(warrant|raid|evidence bags|seized)\b/i, weight: 7, lines: ['POLICE RAID IN {D}', 'DETECTIVES SEIZE CASH IN {D}', 'DAWN RAID ROCKS {D}'] },
  { re: /(shooting at each other|declare war|are finished|nobody left to lead|takes the chair|takes over )/i, tone: 'war', weight: 7, lines: ['GANG WAR FEARS IN {D}', 'MOB FEUD SPILLS INTO {D}', '{D} RESIDENTS AFRAID TO GO OUT', 'NEW BOSS, OLD FEAR IN {D}'] },
  { re: /\b(charged|guilty|locked up)\b/i, weight: 6, lines: ['ARRESTS IN {D} — MORE TO COME, SAYS CAPTAIN', 'D.A. VOWS CRACKDOWN IN {D}', 'DETECTIVES WORKING LATE IN {D}'] },
  { re: /\b(burn|burns|burned|fire|torched)\b/i, weight: 6, lines: ['BLAZE IN {D}', 'FIRE AND FURY IN {D}', 'ARSON SUSPECTED IN {D}'] },
  { re: /\b(hospital|hurt|fight in the street|got to you)\b/i, weight: 4, lines: ['NIGHT OF TROUBLE IN {D}', 'VIOLENCE ON THE STREETS OF {D}', 'BRAWL IN {D}'] },
  { re: /(is yours for|pays you now, not the|take .+ off you)/i, weight: 3, lines: ['{PLACE} CHANGES HANDS', 'WHO IS BEHIND {D}\'S NEW MONEY?', 'BUSINESS BOOMING IN {D} — BUT WHOSE?'] },
];
const QUIET = ['COUNCIL DEBATES PARKING', 'RAIN EXPECTED ALL WEEK', 'LOCAL TEAM LOSES AGAIN', 'BRIDGE REPAIRS DELAYED', 'FERRY FARES TO RISE', 'MAYOR OPENS NEW LIBRARY', 'HEATWAVE BREAKS RECORDS', 'FISH MARKET CELEBRATES CENTURY', 'TRAM STRIKE ENTERS THIRD DAY', 'ZOO WELCOMES TWIN CUBS'];

export function writeNews(w: World, rng: Rng, day: number) {
  const today = w.log.filter(l => l.day === day && (l.blockId || l.businessId || l.npcId));
  const scored = today.map(l => ({ l, d: DESK.find(d => d.re.test(l.text) && (!d.tone || d.tone === l.tone)) })).filter(x => x.d).sort((a, b) => b.d!.weight - a.d!.weight);
  const top = scored[0];
  let text: string, weight: number, blockId: string | undefined;
  // one pick either way, so the rng stream is the same whatever the paper says
  // never the same front page two days running ("NIGHT OF TROUBLE IN NEON ROW" five days out of seven)
  const recent = new Set(w.news.slice(-3).map(h => h.text));
  const fresh = (xs: string[]) => { const f = xs.filter(x => !recent.has(x)); return f.length ? f : xs; };
  if (!top) { text = rng.pick(fresh(QUIET)); weight = 0; }
  else {
    const place = top.l.businessId ? w.businesses[top.l.businessId]?.name : undefined;
    const pool = top.d!.lines.filter(t => place || !t.includes('{PLACE}'));
    const fill = (t: string) => t.replace('{D}', districtOf(w, top.l).toUpperCase()).replace('{PLACE}', (place ?? '').toUpperCase());
    text = rng.pick(fresh((pool.length ? pool : ['TROUBLE IN {D}']).map(fill)));
    weight = top.d!.weight;
    blockId = blockOf(w, top.l);
  }
  w.news.push({ day, text, weight, blockId });
  if (w.news.length > 60) w.news.splice(0, w.news.length - 60);
}

function blockOf(w: World, l: LogEntry): string | undefined {
  return l.blockId ?? (l.businessId ? w.businesses[l.businessId]?.blockId : l.npcId ? w.npcs[l.npcId]?.homeBlockId : undefined);
}

function districtOf(w: World, l: LogEntry): string {
  const b = l.blockId ? w.blocks[l.blockId] : l.businessId ? w.blocks[w.businesses[l.businessId]?.blockId] : l.npcId ? w.blocks[w.npcs[l.npcId]?.homeBlockId] : undefined;
  return b ? w.districts[b.districtId].name : w.city.name;
}
