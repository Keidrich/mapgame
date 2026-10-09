import { useState } from 'react';
import { select, type World } from '@r/sim/index';
import type { Job } from '@r/sim/types';
import { crewPanel, jobApproach, jobTeam, mapPlaces, placeForBlock, territories } from '@r/sim/realCityPlay';
import { APPROACH_INFO, JOBS } from '@r/content/world';
import { GameAction, SceneAction, ExpandSection, cash, type Act } from './GameActions';
export type GameTab = 'City' | 'Crew' | 'Jobs' | 'Empire';
interface Props { world:World; act:Act; onChoose(id:string):void }
export function CrewPanel({world,act}:Props) {
  const c=crewPanel(world);
  return <section aria-label="Crew overview" className="rc-management"><span className="rc-eyebrow">YOUR PEOPLE</span><h2>Crew <small>{c.roster.length}/{c.beds} beds</small></h2>
    {!c.roster.length && <p className="rc-empty">Start with someone on your block. Introduce yourself, build trust, then offer them a place in your crew.</p>}
    {c.roster.map(({npc:n,assignment,skills})=><article className="rc-management-card" key={n.id}><h3>{select.fullName(n)}</h3><p>{n.crew!.status} · {assignment}</p><div className="rc-inline-stats"><span>Loyalty {Math.round(n.crew!.loyalty)}</span><span>{cash(n.crew!.cut)}/day</span><span>Level {n.crew!.level}</span></div><small>{skills.map(([key,value])=>`${key} ${value}`).join(' · ')}</small><div className="rc-place-actions"><GameAction world={world} act={act} action={{type:'assign',npcId:n.id,assignment:{kind:'guard',blockId:world.player.blockId}}} label="Guard my block" detail="Replaces their current assignment."/>{n.crew!.assignment && <GameAction world={world} act={act} action={{type:'assign',npcId:n.id,assignment:null}} label="Free from post"/>}</div></article>)}
    <ExpandSection title="People on your block">{c.locals.map(n=><article key={n.id} className="rc-management-card"><h3>{select.fullName(n)}</h3><p>{n.role} · Trust {Math.round(n.rel.trust)} · {n.rel.met?'You have met':'New face'}</p><div className="rc-place-actions"><SceneAction world={world} act={act} npcId={n.id} kind="chat"/><SceneAction world={world} act={act} npcId={n.id} kind="recruit"/></div></article>)}</ExpandSection>
    <ExpandSection title="Room to grow"><GameAction world={world} act={act} action={{type:'rent_safehouse',blockId:world.player.blockId}} label="Rent a back room" detail="Extra crew beds, stock space, and room for production."/></ExpandSection>
  </section>;
}
function JobCard({world,act,onChoose,job:j}:Props & {job:Job}) {
  const [picked,setPicked]=useState<string[]>(()=>jobTeam(world,j.id));
  const avail=select.crew(world).filter(n=>n.crew!.status==='ready' && n.crew!.assignment?.kind!=='job'), team=j.status==='offer'?picked:j.crewIds;
  const target=j.targetBusinessId ? world.businesses[j.targetBusinessId]?.buildingId : placeForBlock(world,j.blockId);
  return <article className="rc-management-card"><h3>{j.title}</h3><p>{j.status==='planning'?`${j.daysLeft} days of planning left`:j.status} · {JOBS[j.kind].label}</p><p>{j.pitch}</p>
    {target && <button type="button" className="rc-text-action" onClick={()=>onChoose(target)}>Show target on map ↗</button>}
    {j.result ? <p className="rc-job-result">{j.result.text}</p> : <>
      {j.status==='offer' && <><p className="rc-game-note">{j.crewMin?`Needs ${j.crewMin}–${j.crewMax} crew`:'Can be done alone'} · {j.planDays} planning days · Expires day {j.expires}</p>{avail.map(n=><button key={n.id} type="button" className="rc-team-pick" aria-pressed={picked.includes(n.id)} onClick={()=>setPicked(ids=>ids.includes(n.id)?ids.filter(id=>id!==n.id):ids.length<j.crewMax?[...ids,n.id]:ids)}>{select.fullName(n)} {picked.includes(n.id)?'✓':''}<small>{n.crew!.assignment?'Leaves their current post':''}</small></button>)}<GameAction world={world} act={act} action={{type:'take_job',jobId:j.id,crewIds:picked}} label="Take this job" detail={j.planDays?'Your team begins planning.':'Ready to launch after accepting.'}/></>}
      {['offer','planning','ready'].includes(j.status) && <ExpandSection title="Approaches & odds">{JOBS[j.kind].approaches.map(approach=>{const {odds,payout,heat,failureHeat}=jobApproach(world,j,team,approach);return <div className="rc-approach-card" key={approach}><b>{APPROACH_INFO[approach].label} · {odds.chance}%</b><p>{cash(payout.dirty)} dirty · {cash(payout.clean)} clean{payout.goods?` · ${payout.goods} goods`:''}</p><small>Base heat +{heat}; +{failureHeat} on failure, before modifiers.</small>{j.status!=='offer' && <GameAction world={world} act={act} action={{type:'launch_job',jobId:j.id,approach}} label={`Go in ${approach}`}/>}</div>;})}</ExpandSection>}
      {j.status==='paused' && <><b>{j.complication?.title}</b><p>{j.complication?.text}</p>{j.complication?.options.map(o=><GameAction key={o.id} world={world} act={act} action={{type:'answer',jobId:j.id,optionId:o.id}} label={o.label} detail={`${o.pass} / ${o.fail}`}/>)}</>}
    </>}
  </article>;
}
export function JobsPanel(props:Props) {
  const jobs=Object.values(props.world.jobs), active=jobs.filter(j=>['planning','ready','paused'].includes(j.status)),offers=jobs.filter(j=>j.status==='offer').sort((a,b)=>a.tier-b.tier);
  return <section aria-label="Jobs overview" className="rc-management"><span className="rc-eyebrow">YOUR NEXT SCORE</span><h2>Jobs <small>{active.length} active</small></h2>
    {active.map(j=><JobCard key={j.id} {...props} job={j}/>)}
    <h3>Available · {offers.length}</h3>{offers.map(j=><details className="rc-job-offer" key={j.id}><summary>{j.title}<small>{j.crewMin?`${j.crewMin}+ crew`:'Solo possible'} · Tier {j.tier}</small></summary><JobCard {...props} job={j}/></details>)}
    {!offers.length && !active.length && <p className="rc-empty">No jobs on the board right now. Meet people and return after nightfall for new opportunities.</p>}
    <ExpandSection title="Recent results">{jobs.filter(j=>j.result).slice(-6).reverse().map(j=><JobCard key={j.id} {...props} job={j}/>)}</ExpandSection>
  </section>;
}
export function EmpirePanel({world,onChoose}:Props) {
  const f=select.forecast(world), places=mapPlaces(world).filter(p=>p.yours), blocks=territories(world).filter(t=>t.ownerId==='player');
  return <section aria-label="Empire overview" className="rc-management"><span className="rc-eyebrow">BUILT BLOCK BY BLOCK</span><h2>Your empire</h2><div className="rc-empire-counts"><span><b>{places.filter(p=>p.owned).length}</b>Owned</span><span><b>{places.filter(p=>p.protected).length}</b>Protected</span><span><b>{blocks.length}</b>Blocks held</span></div>
    <article className="rc-management-card"><h3>Next day’s forecast</h3><div className="rc-inline-stats"><span>{cash(f.clean)} clean</span><span>{cash(f.dirty)} dirty</span><span>{cash(f.costs)} expenses</span></div><p>Estimate before sales, incidents and other changes. Washing shifts money from dirty to clean.</p></article>
    {!places.length && <p className="rc-empty">Your first foothold starts with an owner. Visit a storefront and build enough trust to offer protection or negotiate a purchase.</p>}
    {places.map(p=><button type="button" className="rc-empire-place" key={p.id} onClick={()=>onChoose(p.buildingId)}><strong>{p.name}</strong><small>{p.status} · Open on map ↗</small></button>)}
    <ExpandSection title={`Territory · ${blocks.length} blocks`}><p className="rc-game-note">Block control follows influence. Owning or protecting a business starts that influence; it does not instantly claim the block.</p>{territories(world).map(t=><div key={t.id} className="rc-territory-row"><span style={{background:t.color}}/><div>{t.name}<small>{t.nameOfOwner} · Your influence {Math.round(t.playerInfluence)}</small></div></div>)}</ExpandSection>
  </section>;
}
