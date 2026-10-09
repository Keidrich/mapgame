/** Real fixture + public reducer loop. No cheats, generated-grid substitution or save migration. */
import { readFileSync } from 'node:fs';
import { newRealCityWorld } from '../remake/sim/realCity';
import { can, dispatch, type Action } from '../remake/sim/index';
import { decodeSave } from '../remake/ui/real-city/save';

const city = JSON.parse(readFileSync('public/data/lower-east-side.json', 'utf8'));
let world = newRealCityWorld(city);
const counts: Record<string, number> = {};
function act(a: Action) {
  if (!can(world, a).ok) return false;
  world = dispatch(world, a); counts[a.type === 'scene' ? a.kind : a.type] = (counts[a.type === 'scene' ? a.kind : a.type] ?? 0) + 1; return true;
}
for (let turn = 0; turn < 20 && !world.over; turn++) {
  for (let guard = 0; world.events.length && guard < 50; guard++) {
    const e = world.events[0], o = e.options.find(o => can(world, { type: 'resolve_event', eventId: e.id, optionId: o.id }).ok);
    if (!o || !act({ type: 'resolve_event', eventId: e.id, optionId: o.id })) throw new Error('Event deadlock.');
  }
  for (const b of Object.values(world.businesses)) {
    if (world.player.ap < 2) break;
    if (world.player.blockId !== b.blockId) act({ type: 'travel', blockId: b.blockId });
    act({ type: 'scene', kind: 'chat', npcId: b.ownerId, businessId: b.id });
    act({ type: 'scene', kind: 'protect', npcId: b.ownerId, businessId: b.id });
  }
  act({ type: 'nightfall' });
  if (!world.events.length) act({ type: 'end_day' });
  world = decodeSave(JSON.parse(JSON.stringify({ format: 1, geographyId: world.city.geography!.id, world })), world.city.geography!.id);
}
for (const key of ['travel', 'chat', 'protect', 'end_day']) if (!counts[key]) throw new Error(`Smoke scenario missed ${key}.`);
for (const b of Object.values(world.businesses)) if (!city.buildings.some((x: {id: string}) => x.id === b.buildingId)) throw new Error('Missing footprint.');
console.log(JSON.stringify({ blocks: Object.keys(world.blocks).length, businesses: Object.keys(world.businesses).length, day: world.day, actions: counts, saveRestored: true, cash: world.player.cash, dirty: world.player.dirty, ending: world.over?.text ?? null }, null, 2));
