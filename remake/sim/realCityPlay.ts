/** Read-only presentation of the real-city campaign. All numbers come from the existing sim. */
import { APPROACH_INFO, BUSINESSES, RACKETS } from '@r/content/world';
import type { Action } from './actions';
import { can } from './reducer';
import * as select from './select';
import { PLAYER, type Approach, type Job, type Business, type World } from './types';

export const PLAYER_MAP_COLOR = '#64d5a2';
export function ownerIdentity(w: World, id: string | undefined) {
  return id === PLAYER ? { id, name: 'You', color: PLAYER_MAP_COLOR } : id && w.factions[id]
    ? { id, name: w.factions[id].short, color: w.factions[id].color }
    : { id: undefined, name: 'Unclaimed', color: '#8794a5' };
}
export function territories(w: World) {
  return Object.values(w.blocks).map(b => {
    const owner=ownerIdentity(w,select.blockController(w,b.id));
    return { id:b.id,name:b.name,poly:b.poly,ownerId:owner.id,nameOfOwner:owner.name,color:owner.color,playerInfluence:b.influence[PLAYER]??0 };
  });
}
export function businessCard(w: World, b: Business) {
  const own = b.ownedBy === PLAYER, protectedByYou = !own && b.protection?.by === PLAYER;
  const protector = ownerIdentity(w, b.protection?.by), holder = ownerIdentity(w, select.blockController(w, b.blockId));
  const owner = w.npcs[b.ownerId], purchase = select.quote(w, 'buy', b.ownerId, { businessId: b.id });
  return { own, protectedByYou, holder, owner,
    status: own ? 'Owned by you' : protectedByYou ? 'Protected by you' : b.protection ? `Protected by ${protector.name}` : b.ownedBy !== 'npc' ? `Owned by ${ownerIdentity(w, b.ownedBy).name}` : 'Independent business',
    color: own || protectedByYou ? PLAYER_MAP_COLOR : b.protection ? protector.color : '#8794a5',
    clean: own && !b.closed ? select.ownTake(b) : 0,
    dirty: protectedByYou ? select.protectionTake(b) : 0,
    purchasePrice: purchase.cash,
    rackets: b.racketIds.map(id => w.rackets[id]).filter(Boolean),
    availableRackets: BUSINESSES[b.type].rackets.filter(kind => !b.racketIds.some(id => w.rackets[id]?.kind === kind)),
  };
}
export function mapPlaces(w: World) {
  return select.realCityPlaces(w).map(p => {
    const card = businessCard(w, w.businesses[p.id]);
    return { ...p, status: card.status, color: card.color, owned: card.own, protected: card.protectedByYou };
  });
}
export function crewPanel(w: World) {
  const roster = select.crew(w).map(n => {
    const a = n.crew!.assignment;
    const assignment = !a ? 'Available' : a.kind === 'racket' ? `Runs ${RACKETS[w.rackets[a.racketId]?.kind]?.label ?? 'a racket'}` : a.kind === 'guard' ? `Guards ${w.blocks[a.blockId]?.name}` : a.kind === 'job' ? w.jobs[a.jobId]?.title ?? 'On a job' : a.kind === 'district' ? 'District lieutenant' : a.kind === 'driver' ? 'Deliveries' : 'Working a lab';
    return { npc: n, assignment, skills: Object.entries(n.skills).sort((a,b) => b[1]-a[1]).slice(0,2) };
  });
  const locals = Object.values(w.npcs).filter(n => n.alive && !n.crew && select.whereIs(w,n) === w.player.blockId && !n.faction && !n.official && !select.crewOf(w,n.id))
    .sort((a,b) => Number(b.role !== 'owner') - Number(a.role !== 'owner') || b.rel.trust-a.rel.trust).slice(0,8);
  return { roster, locals, beds: select.bedsTotal(w) };
}
export function actionFeedback(before: World, after: World, action: Action) {
  const changes: string[] = [];
  const dollars = (n: number) => `${n > 0 ? '+' : '−'}$${Math.abs(Math.round(n)).toLocaleString()}`;
  for (const key of ['cash','dirty'] as const) { const delta = after.player[key]-before.player[key]; if (delta) changes.push(`${dollars(delta)} ${key === 'cash' ? 'clean' : 'dirty'}`); }
  const ap = after.player.ap-before.player.ap, heat = Math.round(after.player.heat-before.player.heat);
  if (ap) changes.push(`${ap>0?'+':''}${ap} h`);
  if (heat) changes.push(`Heat ${heat>0?'+':''}${heat}`);
  if (action.type === 'scene') {
    const previous = before.npcs[action.npcId], next = after.npcs[action.npcId];
    for (const key of ['trust','fear','respect'] as const) { const delta = Math.round(next.rel[key]-previous.rel[key]); if (delta) changes.push(`${key[0].toUpperCase()+key.slice(1)} ${delta>0?'+':''}${delta}`); }
  }
  const gains = Object.values(after.blocks).filter(b => select.blockController(after,b.id) === PLAYER && select.blockController(before,b.id) !== PLAYER);
  if (gains.length) changes.push(`${gains.length} block${gains.length===1?'':'s'} under your control`);
  const last = after.log.at(-1), old = before.log.at(-1);
  return { message: last && (last.text !== old?.text || last.day !== old?.day) ? last.text : 'Your choice took effect.', changes };
}
export function jobTeam(w: World, jobId: string) {
  const j = w.jobs[jobId];
  return select.crew(w).filter(n => n.crew!.status === 'ready' && !n.crew!.assignment && select.crewCity(w,n.id) === select.blockCity(w,j.blockId))
    .sort((a,b) => j.leans.reduce((sum,k) => sum+b.skills[k]-a.skills[k],0)).slice(0,j.crewMin).map(n => n.id);
}
export function placeForBlock(w: World, blockId: string) {
  return w.blocks[blockId]?.businessIds.map(id => w.businesses[id]).find(b => b?.buildingId)?.buildingId;
}
export function readyRunners(w: World, racketId: string) {
  return select.crew(w).filter(n => can(w,{type:'assign',npcId:n.id,assignment:{kind:'racket',racketId}}).ok);
}

export function jobApproach(w: World, j: Job, team: string[], approach: Approach) {
  return { odds:select.jobOdds(w,j,team,approach),payout:select.payoutFor(j,approach),heat:Math.round(j.heat*APPROACH_INFO[approach].heat),failureHeat:Math.round(j.heat*APPROACH_INFO[approach].heat*1.4) };
}
