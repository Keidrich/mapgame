import { PRODUCT_INFO } from '@content/rackets';
import { PRODUCTS } from '@ui/derive';
import { POSTURES } from '@content/authority';
import { select } from '@sim/index';
import { PLAYER, type ProductKind } from '@sim/types';
import { setLayer, useStore, useWorld, type MapLayer } from '@ui/store';
import { Info } from './Info';
import { Icon } from '@ui/icons';

/**
 * Overlays for the map. Every mode shades a per-block field the sim already keeps — nothing
 * here adds a stat, and nothing here writes. If you want a new overlay, find an existing field
 * first; if there isn't one, that is a simulation change and belongs in `/sim`, not here.
 */
const LAYERS: { id: MapLayer; label: string; icon: string; hint: string }[] = [
  { id: 'control', label: 'Control', icon: 'takeover', hint: 'Who runs each block.' },
  { id: 'heat', label: 'Heat', icon: 'heat', hint: 'How hot each block is on you right now.' },
  { id: 'wealth', label: 'Wealth', icon: 'cash', hint: 'What the people here have to take.' },
  { id: 'police', label: 'Police', icon: 'precinct', hint: 'Patrol strength, including what the precincts are putting on it.' },
  { id: 'influence', label: 'Influence', icon: 'social', hint: 'How much of a block belongs to one outfit.' },
  { id: 'demand', label: 'Demand', icon: 'hot_goods', hint: 'What this block would buy in a day.' },
];
const RAMP_CSS: Record<Exclude<MapLayer, 'control'>, string> = {
  heat: 'linear-gradient(90deg,#3a2020,#e5484d)',
  wealth: 'linear-gradient(90deg,#1e2b22,#3fbf6f)',
  police: 'linear-gradient(90deg,#1c2436,#4d8df6)',
  influence: 'linear-gradient(90deg,#2a2233,#b06cf0)',
  demand: 'linear-gradient(90deg,#2b2718,#f2c94c)',
};

export function MapLayers() {
  const w = useWorld();
  const layer = useStore(s => s.layer);
  const factionId = useStore(s => s.layerFactionId) ?? PLAYER;
  const product = useStore(s => s.layerProduct) ?? PRODUCTS[0];
  const def = LAYERS.find(l => l.id === layer)!;
  const watching = select.authorities(w).filter(a => a.posture !== 'routine');
  return (
    <>
      {layer !== 'control' && (
        <div className="layerkey">
          <span className="ramp" style={{ background: RAMP_CSS[layer] }} />
          <span>{def.hint}</span>
        </div>
      )}
      <div className="layerbar">
        <Info id="mapLayer" className="layerbar-q" />
        {LAYERS.map(l => (
          <button type="button" key={l.id} className={`chip btn${layer === l.id ? ' sel' : ''}`} onClick={() => setLayer(l.id)} aria-pressed={layer === l.id}>
            <Icon name={l.icon} size={13} /> {l.label}
          </button>
        ))}
        {layer === 'influence' && (
          <select className="chip btn" value={factionId} onChange={e => setLayer('influence', { factionId: e.target.value })} aria-label="Whose influence">
            <option value={PLAYER}>Yours</option>
            {Object.values(w.factions).filter(f => f.alive).map(f => <option key={f.id} value={f.id}>{f.short}</option>)}
          </select>
        )}
        {layer === 'demand' && (
          <select className="chip btn" value={product} onChange={e => setLayer('demand', { product: e.target.value as ProductKind })} aria-label="Which product">
            {PRODUCTS.map(p => <option key={p} value={p}>{PRODUCT_INFO[p].label}</option>)}
          </select>
        )}
        {layer === 'police' && watching.length > 0 && (
          <span className="chip red"><Icon of="posture" id={select.topPosture(w)} size={12} /> {POSTURES[select.topPosture(w)].label}</span>
        )}
      </div>
    </>
  );
}
