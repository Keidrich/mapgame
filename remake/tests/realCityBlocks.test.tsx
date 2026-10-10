import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import type { RealCity } from '@geo/realCity';
import { newRealCityWorld } from '@r/sim/realCity';
import { select } from '@r/sim/index';
import { territories, mapPlaces } from '@r/sim/realCityPlay';
import { blockAt, blockFrame, frameFlatBlock, selectedBlock, visibleBlocks } from '@r/ui/real-city/MapBlocks';
import { frameBuilding } from '@r/ui/real-city/framing';
import type { MapPlayState } from '@r/ui/real-city/MapPlaces';
import { BlockOverview } from '@r/ui/real-city/BlockOverview';
const city=JSON.parse(readFileSync('public/data/lower-east-side.json','utf8')) as RealCity;
const make=()=>{const w=newRealCityWorld(city);const play:MapPlayState={territories:territories(w),places:mapPlaces(w),jobs:0,crew:0,player:w.blocks[w.player.blockId].center,day:w.day,phase:'day',ap:8,apMax:8,cash:900,dirty:0,heat:0};return {w,play};};
describe('block-first real-city play',()=>{
  it('resolves all storefront and block links to the correct block without changing the campaign',()=>{
    const {w,play}=make(),before=JSON.stringify(w);
    for(const b of Object.values(w.businesses)) {
      expect(selectedBlock(city,play,b.buildingId)?.id).toBe(b.blockId);
      expect(selectedBlock(city,play,b.blockId)?.id).toBe(b.blockId);
    }
    expect(blockAt(play.territories,{x:1e6,y:1e6})).toBeUndefined();
    expect(selectedBlock(city,play,'missing')).toBeUndefined();
    expect(JSON.stringify(w)).toBe(before);
  });
  it('aggregates just this block, separates clean and dirty take, and follows people at night',()=>{
    const {w}=make(),b=Object.values(w.businesses)[0];b.ownedBy='player';b.closed=0;
    const summary=select.realCityBlock(w,b.blockId)!;
    expect(summary.businesses.map(b=>b.id)).toEqual(w.blocks[b.blockId].businessIds);
    expect(summary.clean).toBe(select.ownTake(b));
    expect(summary.jobs.every(j=>j.blockId===b.blockId)).toBe(true);
    w.phase='night';const night=select.realCityBlock(w,b.blockId)!;
    expect(night.people.map(n=>n.id).sort()).toEqual(Object.values(w.npcs).filter(n=>n.alive&&select.whereIs(w,n)===b.blockId).map(n=>n.id).sort());
    b.closed=2;expect(select.realCityBlock(w,b.blockId)!.clean).toBe(0);
    expect(select.realCityBlock(w,'missing')).toBeUndefined();
  });
  it('renders compact business rows, counts and category tabs before any business management',()=>{
    const {w}=make();const block=Object.values(w.blocks).find(b=>b.businessIds.length>1)!;
    const html=renderToStaticMarkup(<BlockOverview world={w} blockId={block.id} city={city} act={()=>{}} onJobs={()=>{}}/>);
    expect(html).toContain('aria-label="Block overview"');
    expect(html.match(/aria-label="Open business /g)).toHaveLength(block.businessIds.length);
    expect(html).toContain('role="tablist"');expect(html).not.toContain('Negotiate &amp; buy');
    expect(html).not.toContain('<select');expect(html).not.toContain('Owner relationship');
  });
  it('prioritizes the selected block marker and keeps 44px hit areas apart',()=>{
    const {play}=make(),a=play.territories[0],b=play.territories[1];
    const visible=visibleBlocks([{...a,x:150,y:240,visible:true},{...b,x:160,y:242,visible:true}],b.id,390,844,{top:130,bottom:430,left:12,right:70});
    expect(visible.map(b=>b.id)).toEqual([b.id]);
  });
  it.each([[320,568],[390,844],[430,932]])('frames a long real block in both views at %i × %i', (width,height)=>{
    const {play}=make();const block=[...play.territories].sort((a,b)=>(Math.max(...b.poly.map(p=>p.y))-Math.min(...b.poly.map(p=>p.y)))-(Math.max(...a.poly.map(p=>p.y))-Math.min(...a.poly.map(p=>p.y))))[0];
    const insets={top:125,bottom:height*.42+92,left:12,right:72};
    const flat=frameFlatBlock(block,width,height,insets),scale=flat.width/width;
    for(const p of block.poly) { const x=(p.x-flat.x)/scale+width/2,y=(p.y-flat.y)/scale+height/2;expect(x).toBeGreaterThan(insets.left);expect(x).toBeLessThan(width-insets.right);expect(y).toBeGreaterThan(insets.top);expect(y).toBeLessThan(height-insets.bottom); }
    const b=blockFrame(city,block),camera=new THREE.PerspectiveCamera(42,width/height,1,10000),target=new THREE.Vector3();camera.position.set(350,560,680);
    frameBuilding(camera,target,b,width,height,insets,6000);
    for(const p of block.poly) for(const h of [0,b.height]) {const v=new THREE.Vector3(p.x,h,p.y).project(camera),x=(v.x+1)*width/2,y=(1-v.y)*height/2;expect(x).toBeGreaterThan(insets.left);expect(x).toBeLessThan(width-insets.right);expect(y).toBeGreaterThan(insets.top);expect(y).toBeLessThan(height-insets.bottom);}
  });
});
