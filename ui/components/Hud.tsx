import { fmtMoneyShort } from '@ui/derive';
import { useWorld } from '@ui/store';

export function Hud() {
  const w = useWorld();
  const p = w.player;
  return (
    <header className="hud">
      <div className="hud-row">
        <div>
          <div className="hud-day">DAY {w.day}</div>
          <div className="hud-place ellipsis" style={{ maxWidth: 110 }}>{w.placeName}</div>
        </div>
        <div className="stat stat-cash grow"><span className="lbl">Cash</span>{fmtMoneyShort(p.cash)}</div>
        <div className="stat stat-dirty grow"><span className="lbl">Dirty</span>{fmtMoneyShort(p.dirty)}</div>
        <div className="heat">
          <div className="lbl"><span>Heat</span><span>{Math.round(p.heat)}</span></div>
          <div className="heatbar"><div style={{ width: `${Math.max(0, Math.min(100, p.heat))}%` }} /></div>
        </div>
      </div>
      <div className="hud-row">
        <div className="pips" aria-label={`${p.ap} of ${p.apMax} action points`}>
          {Array.from({ length: Math.max(p.apMax, p.ap) }, (_, i) => <span key={i} className={`pip${i < p.ap ? ' on' : ''}`} />)}
          <span className="small muted" style={{ marginLeft: 4 }}>{p.ap}/{p.apMax} AP</span>
        </div>
        <div className="grow" />
        <div className="rep">
          <span>Respect <b>{Math.round(p.respect)}</b></span>
          <span>Fear <b>{Math.round(p.fear)}</b></span>
          {p.lawyer && <span title="Lawyer on retainer">⚖️</span>}
          {p.jailedDays > 0 && <span className="red">Jailed {p.jailedDays}d</span>}
        </div>
      </div>
    </header>
  );
}
