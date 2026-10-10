import { Icon } from '@ui/icons';
import type { BusinessType } from '@r/sim/types';
import type { XY } from '@geo/project';
import type { MapInsets } from './view';

export interface MapPlace { id: string; buildingId: string; name: string; type: BusinessType; pos: XY; here: boolean; yours: boolean; travel: number; status?: string; color?: string; owned?: boolean; protected?: boolean }
export interface MapTerritory { id:string; name:string; poly:XY[]; center:XY; businesses:number; here:boolean; ownerId?:string; nameOfOwner:string; color:string; playerInfluence:number }
export interface MapPlayState { territories:MapTerritory[]; jobs:number; crew:number; places: MapPlace[]; player: XY; day: number; phase: string; ap: number; apMax: number; cash: number; dirty: number; heat: number }
export type ProjectedPlace = MapPlace & { x: number; y: number; visible: boolean };
/** Keep 44 px touch targets apart; the selected site wins collisions, then the nearest sites. */
export function visiblePlaces(places: ProjectedPlace[], selected: string | undefined, width: number, height: number, insets: MapInsets) {
  const out: ProjectedPlace[] = [];
  for (const p of [...places].sort((a, b) => Number(b.buildingId === selected) - Number(a.buildingId === selected) || a.travel - b.travel || a.id.localeCompare(b.id))) {
    if (!p.visible || p.x < insets.left + 26 || p.x > width - insets.right - 26 || p.y < insets.top + 26 || p.y > height - insets.bottom - 26) continue;
    if (out.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 48)) continue;
    out.push(p);
  }
  return out;
}
export function MapPlaces({ places, player, selected, onSelect }: { places: ProjectedPlace[]; player?: XY; selected?: string; onSelect(id: string): void }) {
  return <div className="rc-map-places" aria-label="Storefronts on the map">
    {player && <span className="rc-player-dot" style={{ left: player.x, top: player.y }} role="img" aria-label="Your in-game location" />}
    {places.map(p => <button key={p.id} type="button" className={`rc-place-marker ${p.yours ? 'is-yours' : ''} ${p.owned ? 'is-owned' : p.protected ? 'is-protected' : ''}`} style={{ left: p.x, top: p.y, '--place-color':p.color } as React.CSSProperties} aria-label={`Open ${p.name}`} title={`${p.name} · ${p.status ?? 'Storefront'}`} aria-pressed={selected === p.buildingId} onClick={() => onSelect(p.buildingId)}><span><Icon of="business" id={p.type} size={17} /></span></button>)}
  </div>;
}
