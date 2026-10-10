import { useEffect, useRef, useState } from 'react';
import type { RealCity } from '@geo/realCity';
import { select, type World } from '@r/sim/index';
import { businessCard, ownerIdentity } from '@r/sim/realCityPlay';
import { BUSINESSES } from '@r/content/world';
import { Icon } from '@ui/icons';
import { BusinessCard } from './BusinessCard';
import { cash, GameAction, SceneAction, type Act } from './GameActions';

export function BlockOverview({world,blockId,city,act,onJobs,onBrowse}:{world:World;blockId:string;city:RealCity;act:Act;onJobs():void;onBrowse?():void}) {
  const [section,setSection]=useState<'Businesses'|'People'|'Jobs'>('Businesses');
  const [business,setBusiness]=useState<string>(),[person,setPerson]=useState<string>();
  const root=useRef<HTMLElement>(null);
  useEffect(()=>{ const scroll=root.current?.closest('.rc-sheet-scroll'); if(scroll) scroll.scrollTop=0; },[business]);
  const data=select.realCityBlock(world,blockId);
  if(!data) return null;
  const {block,here,businesses,people,jobs}=data, controller=ownerIdentity(world,data.controller);
  const chosen=businesses.find(b=>b.id===business), npc=people.find(n=>n.id===person);
  if(chosen) return <section ref={root} aria-label="Business detail" className="rc-detail-view"><button type="button" className="rc-back-row" onClick={()=>setBusiness(undefined)}><Icon name="back" size={18}/>Back to block</button><BusinessCard world={world} b={chosen} city={city} act={act}/></section>;
  return <section ref={root} className="rc-block-overview" aria-label="Block overview">
    <header className="rc-block-heading"><div className="rc-block-kicker"><span>{data.district.name}</span><span className={`rc-location-badge ${here?'is-here':''}`}>{here?'You are here':data.travel?`${data.travel} h away`:'Free walk'}</span></div><h2>{block.name}</h2><div className="rc-block-control-row"><div className="rc-control-badge"><i style={{background:controller.color}}/><span>{controller.id?`${controller.name} control`:'Unclaimed block'}</span></div>{onBrowse && <button type="button" className="rc-browse-blocks" onClick={onBrowse}>All blocks <span>›</span></button>}</div></header>
    <div className="rc-block-metrics" aria-label="Block summary">
      <div><Icon name="bank" size={19}/><strong>{cash(data.clean+data.dirty)}<small>/day</small></strong><span>Your business take</span></div>
      <div><Icon of="business" id="corner_store" size={19}/><strong>{data.owned+data.protected}<small> / {businesses.length}</small></strong><span>Owned or protected</span></div>
      <div><Icon name="heat" size={19}/><strong>{Math.round(block.heat)}<small>/100</small></strong><span>Local heat</span></div>
    </div>
    {!here && <GameAction world={world} act={act} action={{type:'travel',blockId}} label={data.travel?'Visit this block':'Walk to this block'} detail="Travel here to meet people and do business."/>}
    <div className="rc-block-tabs" role="tablist" aria-label="Block information">{(['Businesses','People','Jobs'] as const).map(label=><button type="button" role="tab" key={label} aria-selected={section===label} aria-controls={`block-${label}`} id={`block-tab-${label}`} onClick={()=>{setSection(label);setPerson(undefined);}}>{label}<b>{label==='Businesses'?businesses.length:label==='People'?people.length:jobs.length}</b></button>)}</div>
    <div role="tabpanel" id={`block-${section}`} aria-labelledby={`block-tab-${section}`}>
    {section==='Businesses' && <div className="rc-block-list">{businesses.map(b=>{const c=businessCard(world,b);return <button type="button" className="rc-business-row" key={b.id} onClick={()=>setBusiness(b.id)} aria-label={`Open business ${b.name}`}><span className={`rc-business-icon rc-kind-${b.type}`}><Icon of="business" id={b.type} size={23}/></span><span className="rc-row-copy"><strong>{b.name}</strong><small>{BUSINESSES[b.type].label}</small><span className="rc-row-status"><i style={{background:c.color}}/>{b.closed?`Closed · ${b.closed}d`:c.status}</span></span><span className="rc-row-chevron">›</span></button>;})}</div>}
    {section==='People' && <div className="rc-block-list">{!people.length && <p className="rc-empty">Nobody is here right now. Check back after nightfall.</p>}{people.map(n=><div key={n.id} className="rc-person-card"><button type="button" className="rc-person-row" aria-expanded={person===n.id} onClick={()=>setPerson(person===n.id?undefined:n.id)}><span className="rc-avatar">{n.first[0]}{n.last[0]}</span><span className="rc-row-copy"><strong>{select.fullName(n)}</strong><small>{n.role} · {n.rel.met?'Met':'New face'}</small></span><span className="rc-row-chevron">{person===n.id?'−':'›'}</span></button>{npc?.id===n.id && <div className="rc-person-actions"><div className="rc-relationship"><span>Trust <b>{Math.round(n.rel.trust)}</b></span><span>Fear <b>{Math.round(n.rel.fear)}</b></span><span>Respect <b>{Math.round(n.rel.respect)}</b></span></div><div className="rc-place-actions"><SceneAction world={world} act={act} npcId={n.id} kind="chat"/><SceneAction world={world} act={act} npcId={n.id} kind="recruit"/></div></div>}</div>)}</div>}
    {section==='Jobs' && <div className="rc-block-list">{!jobs.length && <p className="rc-empty">No active jobs target this block.</p>}{jobs.map(j=><button type="button" className="rc-business-row" key={j.id} onClick={onJobs}><span className="rc-business-icon rc-job-icon"><Icon name="ops" size={22}/></span><span className="rc-row-copy"><strong>{j.title}</strong><small>{j.status} · {j.crewMin?`${j.crewMin}+ crew`:'Solo possible'}</small></span><span className="rc-row-chevron">›</span></button>)}</div>}
    </div>
    <details className="rc-block-intel"><summary>Control & income details</summary><div className="rc-intel-grid"><span>Clean / day<strong>{cash(data.clean)}</strong></span><span>Dirty / day<strong>{cash(data.dirty)}</strong></span><span>Your influence<strong>{Math.round(block.influence.player??0)}</strong></span><span>Population<strong>{block.population.toLocaleString()}</strong></span></div><p>Business income before costs and incidents. Racket payouts appear in each business. Block control follows influence over time.</p></details>
  </section>;
}
