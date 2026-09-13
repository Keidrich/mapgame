import { select } from '@sim/index';
import { assignmentLabel, cap, fmtMoney } from '@ui/derive';
import { useWorld } from '@ui/store';
import { SkillBars } from './Meter';
import { Act } from './Act';
import { NpcRow } from './Rows';
import { TRAIT_LABELS } from '@content/rackets';
import { openSheet } from '@ui/store';
import { Info, Term, TermChip } from './Info';
import { BACKGROUND_BY_ID, START_TRAIT_BY_ID } from '@content/backgrounds';
import { KitSection } from './Kit';

export function CrewTab() {
  const w = useWorld();
  const p = w.player;
  const crew = select.crew(w);
  const counts = crew.reduce((m, n) => { const s = n.crew?.status ?? 'idle'; m[s] = (m[s] ?? 0) + 1; return m; }, {} as Record<string, number>);
  const lts = select.lieutenants(w);
  const runnable = select.districtsRunnable(w).filter(d => !select.lieutenantOf(w, d.id));
  const groups: { title: string; test: (s: string | undefined) => boolean }[] = [
    { title: 'Working', test: s => s === 'assigned' },
    { title: 'Idle', test: s => s === 'idle' || s === undefined },
    { title: 'Out of action', test: s => s === 'injured' || s === 'jailed' },
    { title: 'Gone', test: s => s === 'dead' },
  ];
  const sub = (n: typeof crew[number]) => `${assignmentLabel(w, n.crew?.assignment)} · loyalty ${n.crew?.loyalty ?? 0} · ${fmtMoney(n.crew?.cut ?? 0)}/day`;
  return (
    <div className="panel-inner">
      <h2>Crew</h2>
      <div className="card gold">
        <div className="row between">
          <b style={{ fontSize: 17 }}>{p.name}</b>
          <span className="chips">
            <span className="chip">{BACKGROUND_BY_ID[p.background]?.label ?? cap(p.background)}</span>
            {p.startTrait && START_TRAIT_BY_ID[p.startTrait] && <span className="chip" title={START_TRAIT_BY_ID[p.startTrait].detail}>{START_TRAIT_BY_ID[p.startTrait].ico} {START_TRAIT_BY_ID[p.startTrait].label}</span>}
          </span>
        </div>
        <div className="mt8"><SkillBars skills={p.skills} /></div>
        <div className="row wrap mt8 small muted" style={{ gap: 10 }}>
          <span><Term id="respect">Respect</Term> <b className="gold">{Math.round(p.respect)}</b></span>
          <span><Term id="fear">Fear</Term> <b className="red">{Math.round(p.fear)}</b></span>
          <span><Term id="busts">Busts</Term> <b>{p.busts}</b></span>
          <span><Term id="lawyer">Lawyer</Term> <b>{p.lawyer ? 'on retainer' : 'none'}</b></span>
        </div>
        {!p.lawyer && <div className="mt8"><Act action={{ type: 'hire_lawyer' }} label="Hire lawyer" icon="⚖️" block /></div>}
      </div>

      <KitSection />

      <div className="section-title">Your people ({crew.length})<Info id="loyalty" /></div>
      {crew.length > 0 && (
        <div className="chips mb8">
          {(['idle', 'assigned', 'injured', 'jailed', 'dead'] as const).filter(s => counts[s]).map(s => <TermChip key={s} id="crewStatus" className={`s-${s}`}>{counts[s]} {s}</TermChip>)}
          <TermChip id="cut">Wages {fmtMoney(crew.reduce((a, n) => a + (n.crew?.status === 'dead' ? 0 : n.crew?.cut ?? 0), 0))}/day</TermChip>
        </div>
      )}
      {(lts.length > 0 || runnable.length > 0) && (
        <>
          <div className="section-title">Lieutenants<Info id="lieutenant" /></div>
          {lts.map(n => { const a = n.crew!.assignment as { kind: 'lieutenant'; districtId: string }; const d = w.districts[a.districtId]; const take = d ? select.districtIncome(w, d) : 0; return (
            <button type="button" key={n.id} className="card" style={{ display: 'block', width: '100%', textAlign: 'left', color: 'inherit', font: 'inherit' }} onClick={() => openSheet({ kind: 'npc', npcId: n.id })}>
              <div className="row between"><b>⭐ {n.name}</b><span className="small muted">{d?.name ?? '?'}</span></div>
              <div className="row wrap small muted mt8" style={{ gap: 10 }}>
                <span>Take <b className="gold">{fmtMoney(take)}/day</b></span>
                <span>Cut <b>{fmtMoney(n.crew!.cut)}/day</b></span>
                <span>Loyalty <b>{n.crew!.loyalty}</b></span>
                {n.traits.map(t => <span key={t} className="chip">{TRAIT_LABELS[t] ?? t}</span>)}
              </div>
            </button>); })}
          {runnable.length > 0 && <div className="card"><p className="small muted">{runnable.map(d => d.name).join(', ')} {runnable.length === 1 ? 'has' : 'have'} nobody running {runnable.length === 1 ? 'it' : 'them'}. Open a crew member and assign them to run a district: rackets there earn without a runner and rivals get shown the door.</p></div>}
        </>
      )}
      {crew.length === 0 && <div className="card"><b>No crew yet.</b><p className="small muted mt8">Visit patrons at businesses on the map until they trust you, then recruit them. Cowards can be scared into it.</p></div>}
      {groups.map(g => { const rows = crew.filter(n => g.test(n.crew?.status)); if (!rows.length) return null; return (
        <div key={g.title}>
          <div className="section-title">{g.title} ({rows.length})</div>
          <div className="list">{rows.map(n => <NpcRow key={n.id} w={w} npc={n} sub={sub(n)} />)}</div>
        </div>); })}
    </div>
  );
}
