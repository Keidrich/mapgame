import type { RealCity } from '@geo/realCity';
import { select, type World } from '@r/sim/index';
import type { Business } from '@r/sim/types';
import { businessCard, readyRunners } from '@r/sim/realCityPlay';
import { BUSINESSES, RACKETS } from '@r/content/world';
import { Icon } from '@ui/icons';
import { GameAction, SceneAction, ExpandSection, cash, type Act } from './GameActions';
export function BusinessCard({world,b,city,act}:{world:World;b:Business;city:RealCity;act:Act}) {
  const c=businessCard(world,b), here=b.blockId===world.player.blockId;
  return <article className="rc-place" aria-label={b.name}>
    <span className="rc-place-kind"><Icon of="business" id={b.type} size={20}/>{BUSINESSES[b.type].label}{here && <small> · You are here</small>}</span>
    <h3>{b.name}</h3><small>{city.buildings.find(site=>site.id===b.buildingId)?.address}</small>
    <div className="rc-ownership" style={{borderColor:c.color}}><span style={{background:c.color}}/>{c.status}{b.closed>0 && <b> · Closed {b.closed}d</b>}</div>
    <div className="rc-owner-line"><strong>{select.fullName(c.owner)}</strong><small>{c.own?'Former owner':'Owner'} · {c.owner.rel.met?'Met':'Not introduced'}</small></div>
    <div className="rc-relationship" aria-label="Owner relationship">{(['trust','fear','respect'] as const).map(key=><span key={key}><small>{key}</small><b>{Math.round(c.owner.rel[key])}</b></span>)}</div>
    {!here ? <GameAction world={world} act={act} action={{type:'travel',blockId:b.blockId}} label={select.travelCost(world,b.blockId)?'Visit this block':'Walk here · free'} detail="Meet the owner and work the neighborhood."/> : <div className="rc-place-actions"><SceneAction world={world} act={act} npcId={b.ownerId} businessId={b.id} kind="chat"/>{!c.own && !c.protectedByYou && <SceneAction world={world} act={act} npcId={b.ownerId} businessId={b.id} kind="protect"/>}</div>}
    <div className="rc-income-line"><span>Takings <b>{cash(b.income)}/day</b></span><span>To you <b>{cash(c.clean+c.dirty)}/day {c.clean?'clean':c.dirty?'dirty':''}</b></span></div>
    <p className="rc-game-note">Block control: <strong style={{color:c.holder.color}}>{c.holder.name}</strong>. {c.holder.id==='player'?'You hold this ground.':'Owning or protecting a place builds influence over time.'}</p>
    <ExpandSection title={c.own?'Manage this business':'Negotiate & buy'}>
      {!c.own && <SceneAction world={world} act={act} npcId={b.ownerId} businessId={b.id} kind="buy" label="Buy business"/>}
      {c.protectedByYou && <><p className="rc-game-note">Protection rate · above 15% strains trust.</p><div className="rc-rate-options">{[.1,.12,.15,.2].map(rate=><GameAction key={rate} world={world} act={act} action={{type:'set_rate',businessId:b.id,rate}} label={`${Math.round(rate*100)}%${b.protection?.rate===rate?' · current':''}`}/>)}</div></>}
      <p className="rc-game-note">Security {b.security} · Owner share {cash(select.ownTake(b))}/day when open. Figures are before crew costs and other expenses.</p>
    </ExpandSection>
    <ExpandSection title={`Rackets · ${c.rackets.length}`}>
      {c.rackets.map(r=><div className="rc-management-card" key={r.id}><b>{RACKETS[r.kind].label} · Level {r.level}</b><p>{r.owner==='player' ? `Last payout ${cash(r.lastIncome)} · ${r.runnerId ? select.fullName(world.npcs[r.runnerId]) : 'No runner'}` : `Run by ${world.factions[r.owner]?.short ?? 'another outfit'}`}</p>{r.owner==='player' && <><GameAction world={world} act={act} action={{type:'upgrade_racket',racketId:r.id}} label="Upgrade racket"/>{RACKETS[r.kind].wash && <GameAction world={world} act={act} action={{type:'toggle_wash',racketId:r.id}} label={r.on===false?'Start washing':'Pause washing'}/>}<details><summary>Assign a runner</summary>{readyRunners(world,r.id).map(n=><GameAction key={n.id} world={world} act={act} action={{type:'assign',npcId:n.id,assignment:{kind:'racket',racketId:r.id}}} label={select.fullName(n)} detail={n.crew?.assignment?'Replaces their current assignment.':'Available for work.'}/>)}{!readyRunners(world,r.id).length && <p>Recruit an available crew member from the Crew tab.</p>}</details></>}</div>)}
      {(c.own || c.protectedByYou) ? c.availableRackets.map(kind=><GameAction key={kind} world={world} act={act} action={{type:'start_racket',businessId:b.id,kind}} label={`Start ${RACKETS[kind].label}`} detail={select.racketWarning(world,kind) ?? RACKETS[kind].blurb}/>) : <p className="rc-game-note">Protect or own this business to start a racket here.</p>}
    </ExpandSection>
  </article>;
}
