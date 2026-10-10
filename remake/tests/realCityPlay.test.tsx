import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RealCity } from '@geo/realCity';
import { newRealCityWorld } from '@r/sim/realCity';
import { actionFeedback, businessCard, mapPlaces, territories, jobApproach } from '@r/sim/realCityPlay';
import { can, dispatch, select, type Action } from '@r/sim/index';
import { BUSINESSES, JOBS, APPROACH_INFO } from '@r/content/world';
import { BusinessCard } from '@r/ui/real-city/BusinessCard';
import { CrewPanel, JobsPanel, EmpirePanel } from '@r/ui/real-city/ManagementPanels';
const city=JSON.parse(readFileSync('public/data/lower-east-side.json','utf8')) as RealCity;
describe('real-city empire interface',()=>{
  it('keeps protected, owned and block control distinct and suppresses closed-place income',()=>{
    const w=newRealCityWorld(city),b=Object.values(w.businesses)[0],block=w.blocks[b.blockId];
    b.ownedBy='npc';b.protection={by:'player',rate:.12,since:w.day};block.influence={player:29};
    expect(businessCard(w,b)).toMatchObject({own:false,protectedByYou:true,dirty:select.protectionTake(b),clean:0});
    expect(territories(w).find(t=>t.id===block.id)?.ownerId).toBeUndefined();
    block.influence.player=30; expect(territories(w).find(t=>t.id===block.id)?.ownerId).toBe('player');
    b.ownedBy='player';b.protection=undefined;
    expect(mapPlaces(w).find(p=>p.id===b.id)).toMatchObject({owned:true,protected:false});
    expect(businessCard(w,b).clean).toBe(select.ownTake(b));
    b.closed=2;expect(businessCard(w,b)).toMatchObject({clean:0,dirty:0});
  });
  it('quotes the actual purchase premium, not only the nominal business price',()=>{
    const w=newRealCityWorld(city),b=Object.values(w.businesses)[0],n=w.npcs[b.ownerId];
    n.traits=[];n.rel.trust=0;n.rel.fear=0;b.ownedBy='npc';
    expect(businessCard(w,b).purchasePrice).toBe(Math.round(select.businessPrice(w,b)*1.3));
    n.rel.trust=20;expect(businessCard(w,b).purchasePrice).toBe(select.businessPrice(w,b));
  });
  it('runs buying, racket setup, recruitment and assignment through real can/dispatch and round-trips the save',()=>{
    let w=newRealCityWorld(city);
    const b=Object.values(w.businesses).find(b=>BUSINESSES[b.type].rackets.length>0)!;
    // A funded mid-game fixture exercises the new controls; production has no admin path.
    w.player.cash=50000;w.player.dirty=50000;w.player.ap=100;w.player.apMax=100;w.player.blockId=b.blockId;
    w.npcs[b.ownerId].rel.trust=80;
    const apply=(a:Action)=>{const q=can(w,a);expect(q.ok,q.why).toBe(true);const before=w;w=dispatch(w,a);return actionFeedback(before,w,a);};
    const feedback=apply({type:'scene',kind:'buy',npcId:b.ownerId,businessId:b.id});
    expect(w.businesses[b.id].ownedBy).toBe('player');expect(feedback.changes.some(s=>s.includes('clean'))).toBe(true);
    const kind=BUSINESSES[b.type].rackets.find(kind=>can(w,{type:'start_racket',businessId:b.id,kind}).ok)!;
    expect(kind).toBeDefined();apply({type:'start_racket',businessId:b.id,kind});
    const racket=w.businesses[b.id].racketIds.map(id=>w.rackets[id]).find(r=>r.owner==='player')!;
    apply({type:'nightfall'});
    for(let i=0;w.events.length && i<20;i++){const event=w.events[0],option=event.options.find(o=>can(w,{type:'resolve_event',eventId:event.id,optionId:o.id}).ok)!;apply({type:'resolve_event',eventId:event.id,optionId:option.id});}
    const n=Object.values(w.npcs).find(n=>n.alive && !n.faction && !n.official && !n.crew && n.role!=='owner' && !select.crewOf(w,n.id))!;
    n.homeBlockId=w.player.blockId;n.rel.trust=100;n.rel.respect=100;n.rel.owes=1;w.player.skills.charm=10;
    if(select.whereIs(w,n)!==w.player.blockId) apply({type:'travel',blockId:select.whereIs(w,n)});
    for(let i=0;i<10 && !w.npcs[n.id].crew;i++) apply({type:'scene',kind:'recruit',npcId:n.id});
    expect(w.npcs[n.id].crew).toBeDefined();apply({type:'assign',npcId:n.id,assignment:{kind:'racket',racketId:racket.id}});
    expect(w.rackets[racket.id].runnerId).toBe(n.id);
    const restored=JSON.parse(JSON.stringify(w));expect(mapPlaces(restored)).toEqual(mapPlaces(w));expect(territories(restored)).toEqual(territories(w));
  });
  it('reports actual action deltas and does not invent a relationship improvement on failure',()=>{
    const before=newRealCityWorld(city),b=Object.values(before.businesses)[0],after=structuredClone(before);
    after.player.ap-=1;after.npcs[b.ownerId].rel.trust-=5;
    const f=actionFeedback(before,after,{type:'scene',kind:'protect',npcId:b.ownerId,businessId:b.id});
    expect(f.changes).toContain('-1 h');expect(f.changes).toContain('Trust -5');
    expect(f.changes.some(s=>s.includes('control'))).toBe(false);
  });
  it('renders real business, crew, job and empire data without importing the generated campaign store',()=>{
    const w=newRealCityWorld(city),b=Object.values(w.businesses)[0],act=()=>{},onChoose=()=>{};
    const business=renderToStaticMarkup(<BusinessCard world={w} b={b} city={city} act={act}/>);
    expect(business).toContain(b.name.replace(/'/g,'&#x27;'));expect(business).toContain('Owner relationship');expect(business).toContain('Your take');
    for(const Panel of [CrewPanel,JobsPanel,EmpirePanel]) {
      const html=renderToStaticMarkup(<Panel world={w} act={act} onChoose={onChoose}/>);
      expect(html).not.toContain('<select');expect(html.length).toBeGreaterThan(100);
    }
    for(const j of Object.values(w.jobs)) for(const a of JOBS[j.kind].approaches) {
      const view=jobApproach(w,j,[],a);
      expect(view.odds).toEqual(select.jobOdds(w,j,[],a));expect(view.payout).toEqual(select.payoutFor(j,a));
      expect(view.heat).toBe(Math.round(j.heat*APPROACH_INFO[a].heat));
    }
  });
});
