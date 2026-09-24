import { run, STYLE_IDS } from './bot';
import { select } from '@r/sim/index';
const seeds = [7, 3, 1, 11, 42];
for (const style of STYLE_IDS) {
  const rs = seeds.map(seed => run({ days: 60, seed, style }));
  const m = (f: (r: typeof rs[number]) => number) => Math.round(rs.reduce((t, r) => t + f(r), 0) / rs.length * 10) / 10;
  console.log(`${style.padEnd(9)} worth ${String(m(r => r.w.history.at(-1)?.worth ?? 0)).padStart(8)} control ${String(m(r => select.controlShare(r.w) * 100)).padStart(5)}% heat ${String(m(r => r.w.player.heat)).padStart(5)} jobs ${String(m(r => (r.counts.jobs_done ?? 0) + (r.counts.jobs_failed ?? 0))).padStart(5)} fights ${String(m(r => r.counts.fights ?? 0)).padStart(4)} won ${String(m(r => r.counts.fights_won ?? 0)).padStart(4)} ambush ${String(m(r => r.counts.ambushes ?? 0)).padStart(4)} heirs ${String(m(r => r.w.player.generation - 1)).padStart(4)} over ${rs.filter(r => r.w.over).map(r => `${r.w.over!.ending}${r.w.over!.day}`).join(',') || '-'}`);
}
