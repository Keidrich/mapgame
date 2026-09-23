/**
 * The morning paper. Each day's log is scored and the loudest thing becomes a headline, written
 * in a tabloid register from templates keyed by what kind of thing it was, filled from the log
 * entry's *references* (a district, a place, a person) — never by chopping up the log sentence,
 * which is what the first draft did and how it printed "POLICE MOVE ON LEILA FAHMY CALLS YOUR BLUFF".
 */
import type { Rng } from './rng';
import type { LogEntry, World } from './types';

const DESK: Record<string, string[]> = {
  law: ['POLICE MOVE IN ON {D}', 'D.A. VOWS CRACKDOWN IN {D}', 'DETECTIVES WORKING LATE IN {D}', 'ARRESTS IN {D} — MORE TO COME, SAYS CAPTAIN', 'CITY HALL DEMANDS ANSWERS OVER {D}'],
  war: ['GANG WAR FEARS IN {D}', 'BLOOD ON THE STREETS OF {D}', '{D} RESIDENTS AFRAID TO GO OUT', 'SHOTS FIRED IN {D}', 'MOB FEUD SPILLS INTO {D}'],
  money: ['MYSTERY CASH FLOODS {D}', 'WHO IS BEHIND {D}\'S NEW MONEY?', 'BUSINESS BOOMING IN {D} — BUT WHOSE?', '{PLACE} CHANGES HANDS'],
  bad: ['TRAGEDY IN {D}', 'NIGHT OF TROUBLE IN {D}', '{D} FAMILY GRIEVES', 'FIRE AND FURY IN {D}'],
  good: ['{D} QUIET, FOR NOW', 'A NEW NAME ON THE STREETS OF {D}', '{D} THROWS A PARTY'],
};
const QUIET = ['COUNCIL DEBATES PARKING', 'RAIN EXPECTED ALL WEEK', 'LOCAL TEAM LOSES AGAIN', 'BRIDGE REPAIRS DELAYED', 'FERRY FARES TO RISE', 'MAYOR OPENS NEW LIBRARY', 'HEATWAVE BREAKS RECORDS', 'FISH MARKET CELEBRATES CENTURY', 'TRAM STRIKE ENTERS THIRD DAY', 'ZOO WELCOMES TWIN CUBS'];

const WEIGHT: Record<string, number> = { law: 5, war: 6, money: 2, bad: 3, good: 1, warn: 1, info: 0 };

export function writeNews(w: World, rng: Rng, day: number) {
  const today = w.log.filter(l => l.day === day && (l.blockId || l.businessId || l.npcId));
  const scored = today.map(l => ({ l, s: (WEIGHT[l.tone] ?? 0) + (/(dead|killed|shot|raid|charged|finished|takes over|burn)/i.test(l.text) ? 4 : 0) }));
  scored.sort((a, b) => b.s - a.s);
  const top = scored[0];
  let text: string, weight: number;
  if (!top || top.s < 3) { text = rng.pick(QUIET); weight = 0; }
  else {
    const place = top.l.businessId ? w.businesses[top.l.businessId]?.name : undefined;
    const pool = (DESK[top.l.tone] ?? DESK.bad).filter(t => place || !t.includes('{PLACE}'));
    text = rng.pick(pool).replace('{D}', districtOf(w, top.l).toUpperCase()).replace('{PLACE}', (place ?? '').toUpperCase());
    weight = top.s;
  }
  w.news.push({ day, text, weight });
  if (w.news.length > 60) w.news.splice(0, w.news.length - 60);
}

function districtOf(w: World, l: LogEntry): string {
  const b = l.blockId ? w.blocks[l.blockId] : l.businessId ? w.blocks[w.businesses[l.businessId]?.blockId] : l.npcId ? w.blocks[w.npcs[l.npcId]?.homeBlockId] : undefined;
  return b ? w.districts[b.districtId].name : w.city.name;
}
