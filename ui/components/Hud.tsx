import { useEffect, useRef } from 'react';
import { fmtMoneyShort } from '@ui/derive';
import { openHelp, useWorld } from '@ui/store';

export function Hud() {
  const w = useWorld();
  const p = w.player;
  const ref = useRef<HTMLElement>(null);
  // Publish the real HUD height so sheets, toasts and banners can sit under it (it varies with the safe area and wrapping).
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const apply = () => document.documentElement.style.setProperty('--hud-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <header className="hud" ref={ref}>
      <div className="hud-row">
        <div style={{ minWidth: 0 }}>
          <div className="hud-day">DAY {w.day}</div>
          <div className="hud-place ellipsis" title={w.placeName}>{w.placeName}</div>
        </div>
        <div className="stat stat-cash grow"><span className="lbl">Cash</span>{fmtMoneyShort(p.cash)}</div>
        <div className="stat stat-dirty grow"><span className="lbl">Dirty</span>{fmtMoneyShort(p.dirty)}</div>
        <div className="heat">
          <div className="lbl"><span>Heat</span><span className="n">{Math.round(p.heat)}</span></div>
          <div className="heatbar"><div style={{ width: `${Math.max(0, Math.min(100, p.heat))}%` }} /></div>
        </div>
        <button type="button" className="hud-help" onClick={openHelp} aria-label="How to play">?</button>
      </div>
      <div className="hud-row">
        <div className="pips" aria-label={`${p.ap} of ${p.apMax} action points`}>
          {Array.from({ length: Math.max(p.apMax, p.ap) }, (_, i) => <span key={i} className={`pip${i < p.ap ? ' on' : ''}`} />)}
          <span className="small muted" style={{ marginLeft: 4, whiteSpace: 'nowrap' }}>{p.ap}/{p.apMax} AP</span>
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
