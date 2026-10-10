import type { RealCity, RealBuilding } from '@geo/realCity';
import { pointInRing, type XY } from '@geo/project';
import { Icon } from '@ui/icons';
import type { MapPlayState, MapTerritory } from './MapPlaces';
import { mapAim, type MapInsets } from './view';

export function blockAt(blocks: MapTerritory[], point: XY) {
  return blocks.find(b => pointInRing(point,b.poly));
}
/** Saved business links and address search still resolve to their enclosing block. */
export function selectedBlock(city:RealCity, play:MapPlayState|undefined, id:string|undefined) {
  if (!play || !id) return undefined;
  const direct=play.territories.find(b=>b.id===id);
  if (direct) return direct;
  const building=city.buildings.find(b=>b.id===id);
  return building ? blockAt(play.territories,building.center) : undefined;
}
export function blockFrame(city:RealCity, block:MapTerritory):RealBuilding {
  const height=Math.max(1,...city.buildings.filter(b=>pointInRing(b.center,block.poly)).map(b=>b.height));
  return {id:block.id,address:block.name,kind:'yes',center:block.center,rings:[block.poly],height,minHeight:0,heightSource:'estimated'};
}
export function frameFlatBlock(block:MapTerritory,width:number,height:number,insets:MapInsets) {
  const xs=block.poly.map(p=>p.x),ys=block.poly.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.max(140/width,(maxX-minX)/Math.max(60,width-insets.left-insets.right-30),(maxY-minY)/Math.max(60,height-insets.top-insets.bottom-30));
  const aim=mapAim(width,height,insets);
  return {x:(minX+maxX)/2+(width/2-aim.x)*scale,y:(minY+maxY)/2+(height/2-aim.y)*scale,width:scale*width};
}
export type ProjectedBlock = MapTerritory & {x:number;y:number;visible:boolean};
export function visibleBlocks(blocks:ProjectedBlock[], selected:string|undefined,width:number,height:number,insets:MapInsets) {
  const out:ProjectedBlock[]=[];
  for(const b of [...blocks].sort((a,b)=>Number(b.id===selected)-Number(a.id===selected)||Number(b.here)-Number(a.here)||a.id.localeCompare(b.id))) {
    if(!b.visible || b.x<insets.left+35 || b.x>width-insets.right-35 || b.y<insets.top+26 || b.y>height-insets.bottom-26) continue;
    if(out.some(p=>Math.abs(p.x-b.x)<78 && Math.abs(p.y-b.y)<52)) continue;
    out.push(b);
  }
  return out;
}
export function MapBlocks({blocks,player,selected,onSelect}:{blocks:ProjectedBlock[];player?:XY;selected?:string;onSelect(id:string):void}) {
  return <div className="rc-map-places" aria-label="Playable blocks">
    {player && <span className="rc-player-dot" style={{left:player.x,top:player.y}} role="img" aria-label="Your in-game location"/>}
    {blocks.map(b=><button type="button" key={b.id} className="rc-block-marker" style={{left:b.x,top:b.y,'--block-color':b.color} as React.CSSProperties} aria-label={`Open block ${b.name}`} aria-pressed={selected===b.id} onClick={()=>onSelect(b.id)}><Icon name="map" size={18}/><strong>{b.businesses}</strong><span className="rc-sr-only"> businesses</span>{b.here && <i aria-label="You are here"/>}</button>)}
  </div>;
}
