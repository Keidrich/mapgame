import { PRODUCT_INFO } from '@content/rackets';
import { PRODUCTS } from '@ui/derive';
import { POSTURES } from '@content/authority';
import { select } from '@sim/index';
import { PLAYER, type ProductKind } from '@sim/types';
import { setLayer, toggleLayers, useStore, useWorld, type MapLayer } from '@ui/store';
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

/**
 * The picker is a menu, not a permanent bar.
 *
 * Six modes plus their sub-pickers is two rows of chips, and on a phone that is a solid band of
 * furniture across the bottom of the map you cannot get rid of — over exactly the blocks you are
 * most likely to be looking at, since you are usually standing in the middle of your own ground.
 * Shut, it is one chip naming the mode you are in; open, it is the same list it always was.
 * Picking a mode closes it again, because picking one is the reason it was opened.
 */
export function MapLayers() {
  const w = useWorld();
  const layer = useStore(s => s.layer);
  const open = useStore(s => s.layersOpen);
  const factionId = useStore(s => s.layerFactionId) ?? PLAYER;
  const product = useStore(s => s.layerProduct) ?? PRODUCTS[0];
  const def = LAYERS.find(l => l.id === layer)!;
  const watching = select.authorities(w).filter(a => a.posture !== 'routine');
  const pick = (id: MapLayer) => { setLayer(id); toggleLayers(false); };
  return (
    <>
      {/* the ramp key only means something while an overlay is on, and only while you are reading
          the list — once it is shut the chip itself says which mode you are in */}
      {layer !== 'control' && open && (
        <div className="layerkey">
          <span className="ramp" style={{ background: RAMP_CSS[layer] }} />
          <span>{def.hint}</span>
        </div>
      )}
      <div className={`layerbar${open ? ' open' : ''}`}>
        <button type="button" className={`chip btn layerbar-toggle${layer === 'control' ? '' : ' sel'}`}
          onClick={() => toggleLayers()} aria-expanded={open} aria-controls="map-layer-menu">
          <Icon name={def.icon} size={13} /> {def.label}
          <Icon name={open ? 'caret' : 'caret_up'} size={11} />
        </button>
        {open && LAYERS.filter(l => l.id !== layer).map(l => (
          <button type="button" key={l.id} className="chip btn" id={l.id === LAYERS[0].id ? 'map-layer-menu' : undefined} onClick={() => pick(l.id)}>
            <Icon name={l.icon} size={13} /> {l.label}
          </button>
        ))}
        {/* last, not second: between the current mode and the rest it broke the list in half */}
        {open && <Info id="mapLayer" className="layerbar-q" />}
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
