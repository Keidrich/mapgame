/** Headless soak: a sensible scripted player plays N days. `npm run sim -- 60 [seed]`. */
import { PLAYER, can, dispatch, generateWorld, select, type Action, type World } from '@sim/index';
import { Rng } from '@sim/rng';

const days = Number(process.argv[2] ?? 40); const seed = Number(process.argv[3] ?? 7);
let w: World = generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'Bot', background: 'muscle', seed });
const rng = new Rng(seed * 7 + 1);
const tryAct = (a: Action) => { const c = can(w, a); if (c.ok) { w = dispatch(w, a); return true; } return false; };
const start = select.startBlock(w);
const nearBiz = () => Object.values(w.blocks).filter(b => select.distanceFromStart(w, b.id) <= 2).flatMap(b => select.businessesIn(w, b.id));

for (let d = 0; d < days; d++) {
  while (w.pendingEvents.length) { const e = w.pendingEvents[0]; const opts = e.options.filter(o => can(w, { type: 'resolve_event', eventId: e.id, optionId: o.id }).ok); const o = opts.length ? rng.pick(opts) : e.options[e.options.length - 1]; w = dispatch(w, { type: 'resolve_event', eventId: e.id, optionId: o.id }); }
  let guard = 0;
  while (w.player.ap > 0 && guard++ < 30) {
    const p = w.player; const biz = nearBiz();
    const mine = biz.filter(b => b.protection?.factionId === PLAYER || b.ownedBy === 'player');
    const soft = biz.filter(b => !b.protection && b.ownedBy === 'npc');
    // 1. recruit anyone willing
    const willing = biz.flatMap(b => b.patronIds).find(id => can(w, { type: 'recruit', npcId: id }).ok);
    if (willing && select.crew(w).length < 6) { tryAct({ type: 'recruit', npcId: willing }); continue; }
    // 2. lay low if hot
    if (p.heat > 45) { const captain = select.officials(w).find(o => o.official!.kind === 'captain')!; if (p.cash > 2500 && !tryAct({ type: 'bribe_official', npcId: captain.id, amount: 1000 })) {} const n = rng.pick(biz.flatMap(b => [b.ownerId, ...b.patronIds])); tryAct({ type: 'visit', npcId: n }); continue; }
    // 3. add rackets to places we hold
    const spot = mine.find(b => select.availableRackets(w, b).some(k => ['numbers', 'bookmaking', 'laundering'].includes(k)));
    if (spot && p.cash > 1500) { const k = select.availableRackets(w, spot).find(k => ['numbers', 'bookmaking', 'laundering'].includes(k))!; if (tryAct({ type: 'start_racket', businessId: spot.id, kind: k })) continue; }
    // 4. expand protection
    const t = soft.sort((a, b) => (w.npcs[a.ownerId].nerve - w.npcs[a.ownerId].rel.fear) - (w.npcs[b.ownerId].nerve - w.npcs[b.ownerId].rel.fear))[0];
    if (t) { if (tryAct({ type: 'protect', businessId: t.id, rate: 0.15 })) continue; if (tryAct({ type: 'shakedown', businessId: t.id })) continue; if (tryAct({ type: 'threaten', npcId: t.ownerId })) continue; }
    // 5. buy a business if rich
    const buy = biz.find(b => b.ownedBy === 'npc' && can(w, { type: 'buy_business', businessId: b.id, offer: Math.round(b.value * 0.9) }).ok);
    if (buy && p.cash > buy.value * 1.5) { tryAct({ type: 'buy_business', businessId: buy.id, offer: Math.round(buy.value * 0.9) }); continue; }
    const n = rng.pick(biz.flatMap(b => [b.ownerId, ...b.patronIds])); tryAct({ type: 'visit', npcId: n });
  }
  if (!w.player.safehouseIds.length) tryAct({ type: 'rent_safehouse', blockId: start.id });
  for (const n of select.idleCrew(w)) { const r = w.player.racketIds.map(id => w.rackets[id]).find(r => !r.runnerId); if (r) tryAct({ type: 'assign', npcId: n.id, assignment: { kind: 'racket', racketId: r.id } }); }
  if (w.player.dirty > 500) tryAct({ type: 'launder', amount: w.player.dirty });
  if (w.player.cash > 8000 && !w.player.lawyer) tryAct({ type: 'hire_lawyer' });
  w = dispatch(w, { type: 'end_day' });
  const bad = (v: number, what: string) => { if (!Number.isFinite(v)) throw new Error(`NaN in ${what} on day ${w.day}`); };
  bad(w.player.cash, 'cash'); bad(w.player.dirty, 'dirty'); bad(w.player.heat, 'heat');
  for (const b of Object.values(w.blocks)) for (const v of Object.values(b.influence)) bad(v, `influence ${b.id}`);
  for (const r of Object.values(w.rackets)) bad(r.lastIncome, `racket ${r.id}`);
}
const p = w.player;
console.log(`Day ${w.day} | cash ${Math.round(p.cash)} dirty ${Math.round(p.dirty)} heat ${Math.round(p.heat)} respect ${p.respect} fear ${p.fear}`);
console.log(`crew ${p.crewIds.length} (${select.crew(w).map(n => n.crew?.status).join(',')}) | businesses ${p.businessIds.length} | rackets ${p.racketIds.length} (${p.racketIds.map(id => w.rackets[id].kind).join(',')}) | safehouses ${p.safehouseIds.length} | control ${(select.controlShare(w) * 100).toFixed(1)}%`);
for (const f of Object.values(w.factions)) console.log(`${f.name.padEnd(24)} ${f.temperament.padEnd(11)} soldiers ${String(f.soldiers).padStart(2)} cash ${String(Math.round(f.cash)).padStart(7)} blocks ${String(select.blocksOf(w, f.id).length).padStart(3)} stance→player ${f.stance[PLAYER]} (${Math.round(f.standing[PLAYER])})`);
for (const l of w.log.filter(l => l.text.startsWith('Day ') && l.day % 5 === 0)) console.log(`[${l.day}] ${l.text}`);
console.log('--- last 12 ---');
for (const l of w.log.slice(-12)) console.log(`[${l.day}] ${l.tone.padEnd(5)} ${l.text}`);
console.log(`state size ${(JSON.stringify(w).length / 1024).toFixed(0)} KB; ${Object.keys(w.npcs).length} npcs, ${Object.keys(w.businesses).length} businesses`);
