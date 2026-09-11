import { select } from '@sim/index';
import { assignmentLabel, cap, fmtMoney } from '@ui/derive';
import { useWorld } from '@ui/store';
import { SkillBars } from './Meter';
import { Act } from './Act';
import { NpcRow } from './Rows';

export function CrewTab() {
  const w = useWorld();
  const p = w.player;
  const crew = select.crew(w);
  const counts = crew.reduce((m, n) => { const s = n.crew?.status ?? 'idle'; m[s] = (m[s] ?? 0) + 1; return m; }, {} as Record<string, number>);
  return (
    <div className="panel-inner">
      <h2>Crew</h2>
      <div className="card gold">
        <div className="row between"><b style={{ fontSize: 17 }}>{p.name}</b><span className="chip">{cap(p.background)}</span></div>
        <div className="mt8"><SkillBars skills={p.skills} /></div>
        <div className="row wrap mt8 small muted" style={{ gap: 10 }}>
          <span>Respect <b className="gold">{Math.round(p.respect)}</b></span>
          <span>Fear <b className="red">{Math.round(p.fear)}</b></span>
          <span>Busts <b>{p.busts}</b></span>
          <span>Lawyer <b>{p.lawyer ? 'on retainer' : 'none'}</b></span>
        </div>
        {!p.lawyer && <div className="mt8"><Act action={{ type: 'hire_lawyer' }} label="Hire lawyer" icon="⚖️" block /></div>}
      </div>

      <div className="section-title">Your people ({crew.length})</div>
      {crew.length > 0 && (
        <div className="chips mb8">
          {(['idle', 'assigned', 'injured', 'jailed', 'dead'] as const).filter(s => counts[s]).map(s => <span key={s} className={`chip s-${s}`}>{counts[s]} {s}</span>)}
          <span className="chip">Wages {fmtMoney(crew.reduce((a, n) => a + (n.crew?.status === 'dead' ? 0 : n.crew?.cut ?? 0), 0))}/day</span>
        </div>
      )}
      <div className="list">
        {crew.map(n => <NpcRow key={n.id} w={w} npc={n} sub={`${assignmentLabel(w, n.crew?.assignment)} · loyalty ${n.crew?.loyalty ?? 0} · ${fmtMoney(n.crew?.cut ?? 0)}/day`} />)}
        {crew.length === 0 && <div className="card"><b>No crew yet.</b><p className="small muted mt8">Visit patrons at businesses on the map until they trust you, then recruit them. Cowards can be scared into it.</p></div>}
      </div>
    </div>
  );
}
