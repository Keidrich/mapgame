import { newWorld, dispatch, can, select } from '@r/sim/index';
let w = newWorld({ seed: 7, size: 'medium', name: 'T', background: 'grifter' });
console.log(w.region!.cities.map(c => `${c.id} ${c.name} (${c.kind}, ${c.size}) links ${c.links.join(',')} demand ${JSON.stringify(c.demand)}`).join('\n'));
const next = w.region!.cities.find(c => c.id !== 'c0')!;
console.log('before open:', can(w, { type: 'travel_city', cityId: next.id }).why);
next.open = true; w.player.cash = 5000;
console.log('after open:', JSON.stringify(can(w, { type: 'travel_city', cityId: next.id })));
const t0 = performance.now();
w = dispatch(w, { type: 'travel_city', cityId: next.id });
console.log('founded in', Math.round(performance.now() - t0), 'ms; blocks', Object.keys(w.blocks).length, 'npcs', Object.keys(w.npcs).length, 'factions', Object.keys(w.factions).join(','));
console.log('here', w.player.blockId, w.blocks[w.player.blockId].name, 'control home', select.controlShare(w), 'there', select.controlShare(w, next.id));
const home = Object.values(w.blocks).find(b => !w.districts[b.districtId].cityId)!;
console.log('walk home:', can(w, { type: 'travel', blockId: home.id }).why);
for (let d = 0; d < 5; d++) { w.events = []; w = dispatch(w, { type: 'end_day' }); }
console.log('day', w.day, 'jobs', Object.values(w.jobs).filter(j => j.status === 'offer').map(j => `${j.title} @${w.districts[w.blocks[j.blockId].districtId].cityId ?? 'c0'}`).join(' | '));
console.log('json size', (JSON.stringify(w).length / 1e6).toFixed(2), 'MB');
