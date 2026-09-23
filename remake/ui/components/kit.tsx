/** The Remake's small parts: a button that asks the sim, a meter, a sheet, a chip. */
import { useState, type ReactNode } from 'react';
import { can, type Action } from '@r/sim/index';
import { Icon } from '@ui/icons';
import { act, closeSheet, useWorld } from '../store';

/**
 * Every game button. It asks `can()` whether it may run and shows the answer — so a disabled
 * button always says *why*, in the sim's own words — and presses go through `act()`.
 */
export function Do({ action, label, icon, kind = 'plain', small, block, sub, onDone, confirm }: { action: Action; label: ReactNode; icon?: string; kind?: 'plain' | 'primary' | 'danger' | 'ghost'; small?: boolean; block?: boolean; sub?: ReactNode; onDone?: () => void; confirm?: string }) {
  const w = useWorld();
  const ok = can(w, action);
  const [asking, setAsking] = useState(false);
  const press = () => {
    if (confirm && !asking) { setAsking(true); return; }
    setAsking(false);
    if (act(action)) onDone?.();
  };
  return (
    <div className={`r-do${block ? ' block' : ''}`}>
      <button type="button" className={`r-btn ${kind}${small ? ' small' : ''}${block ? ' block' : ''}`} disabled={!ok.ok} onClick={press} title={ok.ok ? undefined : ok.why}>
        {icon && <Icon name={icon} size={small ? 14 : 16} />}
        <span className="r-btn-label">{asking ? confirm : label}</span>
        {ok.ok && (ok.ap || ok.cash) ? <span className="r-cost">{ok.ap ? `${ok.ap} AP` : ''}{ok.ap && ok.cash ? ' · ' : ''}{ok.cash ? `$${ok.cash.toLocaleString('en-US')}` : ''}</span> : null}
      </button>
      {/* small buttons say why too: a phone has no hover, and a greyed button with no reason is a dead end */}
      {!ok.ok && ok.why && <p className={`r-why${small ? ' tiny' : ''}`}>{ok.why}</p>}
      {ok.ok && sub && <p className="r-sub">{sub}</p>}
    </div>
  );
}

export function Meter({ value, max = 100, tone = 'gold', label, right }: { value: number; max?: number; tone?: 'gold' | 'red' | 'green' | 'blue' | 'heat'; label?: ReactNode; right?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="r-meter">
      {(label || right) && <div className="r-meter-top"><span>{label}</span><span className="num">{right ?? Math.round(value)}</span></div>}
      <div className="r-meter-bar"><div className={`r-meter-fill ${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/** A −100..100 dial: trust, standing. */
export function Dial({ value, label }: { value: number; label: ReactNode }) {
  const pct = (value + 100) / 2;
  return (
    <div className="r-meter">
      <div className="r-meter-top"><span>{label}</span><span className="num">{value > 0 ? '+' : ''}{Math.round(value)}</span></div>
      <div className="r-dial"><div className="r-dial-mid" /><div className={`r-dial-fill ${value >= 0 ? 'pos' : 'neg'}`} style={value >= 0 ? { left: '50%', width: `${pct - 50}%` } : { left: `${pct}%`, width: `${50 - pct}%` }} /></div>
    </div>
  );
}

export function Sheet({ title, kicker, children, art, onClose = closeSheet }: { title: ReactNode; kicker?: ReactNode; children: ReactNode; art?: ReactNode; onClose?: () => void }) {
  return (
    <div className="r-sheet-wrap" role="dialog" aria-modal="true">
      <button type="button" className="r-scrim" aria-label="Close" onClick={onClose} />
      <section className="r-sheet">
        <header className="r-sheet-head">
          {art}
          <div className="grow">
            {kicker && <div className="r-kicker">{kicker}</div>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="r-close" aria-label="Close" onClick={onClose}><Icon name="cross" size={18} /></button>
        </header>
        <div className="r-sheet-body">{children}</div>
      </section>
    </div>
  );
}

export function Chip({ children, tone, title }: { children: ReactNode; tone?: 'gold' | 'red' | 'green' | 'blue' | 'muted' | 'violet'; title?: string }) {
  return <span className={`r-chip${tone ? ` ${tone}` : ''}`} title={title}>{children}</span>;
}

export function Section({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return <section className="r-section"><div className="r-section-head"><h3>{title}</h3>{right}</div>{children}</section>;
}

export function Empty({ children }: { children: ReactNode }) { return <p className="r-empty">{children}</p>; }

export function Row({ onClick, left, title, sub, right }: { onClick?: () => void; left?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  const inner = <>{left}<div className="grow r-row-text"><div className="r-row-title">{title}</div>{sub && <div className="r-row-sub">{sub}</div>}</div>{right}</>;
  return onClick ? <button type="button" className="r-row" onClick={onClick}>{inner}</button> : <div className="r-row">{inner}</div>;
}

export const fmt = (n: number) => { const a = Math.abs(Math.round(n)); const s = a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `$${Math.round(a / 1000)}k` : `$${a.toLocaleString('en-US')}`; return n < 0 ? `−${s}` : s; };
