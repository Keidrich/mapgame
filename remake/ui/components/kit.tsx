/** The Remake's small parts: a button that asks the sim, a meter, a sheet, a chip. */
import { useRef, useState, type PointerEvent as RPE, type ReactNode } from 'react';
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
  // a label that already names the price ("Buy it ($2,400)") does not need it twice beside it
  const shownCash = ok.cash && !(typeof label === 'string' && label.includes(`$${ok.cash.toLocaleString('en-US')}`)) ? ok.cash : 0;
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
        {ok.ok && (ok.ap || shownCash) ? <span className="r-cost">{ok.ap ? `${ok.ap} ${ok.ap === 1 ? 'hr' : 'hrs'}` : ''}{ok.ap && shownCash ? ' · ' : ''}{shownCash ? `$${shownCash.toLocaleString('en-US')}` : ''}</span> : null}
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

/**
 * An iOS sheet. It rises from the bottom; dragging its head down past a fifth of its height (or
 * flicking it) sends it away, as does tapping the dimmed screen behind it. Only the head drags —
 * the body scrolls, and a sheet that also dragged from its body would fight every scroll.
 */
export function Sheet({ title, kicker, children, art, onClose = closeSheet }: { title: ReactNode; kicker?: ReactNode; children: ReactNode; art?: ReactNode; onClose?: () => void }) {
  const el = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const down = (e: RPE<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    el.current?.classList.add('dragging');
  };
  const move = (e: RPE<HTMLElement>) => {
    const d = drag.current; if (!d || !el.current) return;
    d.dy = Math.max(0, e.clientY - d.y);
    el.current.style.transform = `translateY(${d.dy}px)`;
  };
  const up = () => {
    const d = drag.current; const s = el.current; drag.current = null;
    if (!d || !s) return;
    s.classList.remove('dragging');
    const fast = d.dy / Math.max(1, performance.now() - d.t) > 0.6;
    if (d.dy > s.offsetHeight * 0.2 || (fast && d.dy > 30)) { s.classList.add('settle'); s.style.transform = 'translateY(100%)'; setTimeout(onClose, 200); return; }
    s.classList.add('settle'); s.style.transform = '';
    setTimeout(() => s.classList.remove('settle'), 260);
  };
  const handlers = { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up };
  return (
    <div className="r-sheet-wrap" role="dialog" aria-modal="true">
      <button type="button" className="r-scrim" aria-label="Close" onClick={onClose} />
      <section className="r-sheet" ref={el}>
        <div className="r-grab" aria-hidden="true" {...handlers} />
        <header className="r-sheet-head" {...handlers}>
          {art}
          <div className="grow">
            {kicker && <div className="r-kicker">{kicker}</div>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="r-close" aria-label="Close" onClick={onClose}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
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

/** "1 place", "3 places": a count with its noun agreeing. */
export const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
