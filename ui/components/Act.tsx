import { useState, type FocusEvent, type ReactNode } from 'react';
import type { Action } from '@sim/actions';
import { act, check, isOpen, toggleFold, useStore, type SceneRequest } from '@ui/store';
import { fmtMoney } from '@ui/derive';
import { Icon } from '@ui/icons';

/**
 * A button bound to a sim Action. Disabled (with the sim's refusal reason as a
 * caption) when `can()` says no; shows AP / cash cost when the sim reports it.
 */
export function Act({ action, label, kind = '', block, small, onDone, confirm, icon }: {
  action: Action; label: ReactNode; kind?: '' | 'primary' | 'danger' | 'ghost'; block?: boolean; small?: boolean; onDone?: () => void; confirm?: string; /** An icon *name* from `ui/icons`, not a glyph. */
  icon?: string;
}) {
  useStore(s => s.world); // re-evaluate affordance when the world changes
  const a = check(action);
  // Do not repeat a cash cost the label already spells out ("Give $500").
  const cashShown = a.ok && a.cost?.cash ? typeof label === 'string' && label.includes(fmtMoney(a.cost.cash)) : false;
  const cost = a.ok && a.cost ? [a.cost.ap ? `${a.cost.ap} AP` : '', a.cost.cash && !cashShown ? fmtMoney(a.cost.cash) : ''].filter(Boolean).join(' · ') : '';
  const cls = `btn${kind ? ` btn-${kind}` : ''}${block ? ' btn-block' : ''}${small ? ' btn-sm' : ''}`;
  const onClick = () => {
    if (confirm && !window.confirm(confirm)) return;
    if (act(action)) onDone?.();
  };
  return (
    <div className="actwrap">
      <button type="button" className={cls} disabled={!a.ok} onClick={onClick}>
        {icon && <Icon name={icon} size={15} />}<span>{label}</span>{cost && <span className="cost">{cost}</span>}
      </button>
      {!a.ok && <span className="btn-caption">{a.reason}</span>}
    </div>
  );
}

/** Scroll a focused input to the middle of its scroll container so the confirm button under it stays visible above the keyboard. */
function revealInput(e: FocusEvent<HTMLInputElement>) {
  const input = e.target;
  setTimeout(() => {
    const box = input.closest<HTMLElement>('.sheet-body, .panel, .modal');
    if (!box) return;
    const r = input.getBoundingClientRect(); const b = box.getBoundingClientRect();
    box.scrollBy({ top: r.top - b.top - b.height / 2 + r.height, behavior: 'smooth' });
  }, 300);
}

/** Chips of preset amounts plus a free number input. */
export function AmountPicker({ presets, value, onChange, prefix = '$', min = 0, max }: { presets: number[]; value: number; onChange: (v: number) => void; prefix?: string; min?: number; max?: number }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="chips">
        {presets.map(p => <button type="button" key={p} className={`chip btn${value === p ? ' sel' : ''}`} onClick={() => onChange(p)}>{prefix}{p.toLocaleString('en-US')}</button>)}
      </div>
      <input className="input amount" type="number" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" min={min} max={max} value={Number.isFinite(value) ? value : ''} aria-label="Amount"
        onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))} onFocus={revealInput} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
}

/** A collapsible sub-form: a button that reveals its children in place. When open it takes the full row of an `.actions` grid. */
export function Disclosure({ label, children, icon, kind }: { label: string; children: ReactNode; icon?: string; kind?: '' | 'primary' | 'danger' | 'ghost' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`actwrap${open ? ' open' : ''}`}>
      <button type="button" className={`btn${kind ? ` btn-${kind}` : ''}${open ? ' btn-ghost' : ''}`} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {icon && <Icon name={icon} size={15} />}<span>{label}</span><Icon name="caret" size={13} className={`muted${open ? ' flip' : ''}`} />
      </button>
      {open && <div className="card disc-panel mt8">{children}</div>}
    </div>
  );
}

/**
 * A button that opens a conversation rather than acting straight away.
 *
 * This used to set a UI-only `scene` slot and the sheet drove the whole thing from there. It now
 * dispatches a real `talk` action: a conversation is world state, queued on the confrontation
 * list, so it survives a reload, is visible to the sim, and is answered the same way somebody at
 * your door is. The gate is still the scene's own — there is no point opening a conversation you
 * could not possibly close, so a player out of AP is told so at the door.
 */
export function SceneAct({ scene, label, icon, kind = '' }: { scene: SceneRequest; label: ReactNode; icon?: string; kind?: '' | 'primary' | 'danger' | 'ghost' }) {
  useStore(s => s.world);
  const open: Action = { type: 'talk', scene: scene.kind, npcId: scene.npcId, businessId: scene.businessId, otherFactionId: scene.otherFactionId };
  const a = check(open);
  return (
    <div className="actwrap">
      <button type="button" className={`btn${kind ? ` btn-${kind}` : ''}`} disabled={!a.ok} onClick={() => act(open)}>
        {icon && <Icon name={icon} size={15} />}<span>{label}</span><span className="cost">{scene.kind === 'broker' ? 2 : 1} AP</span>
      </button>
      {!a.ok && <span className="btn-caption">{a.reason}</span>}
    </div>
  );
}

/**
 * A section heading you can shut.
 *
 * The Empire tab is one long column — holdings, businesses, rackets, safehouses, cold cases, the
 * news, the record, the log — and on a phone that is a great deal of scrolling past things you are
 * not looking at today. This is the same `.section-title` rule as before, made into a button, so
 * a shut section is one line of furniture rather than forty.
 *
 * Two things make it usable rather than merely collapsible:
 *
 *  - **the heading still says what is inside.** `count` renders next to the title and stays
 *    visible when the body is shut, so "Rackets 12" is readable without opening anything. A
 *    collapsed section that tells you nothing is just a hidden section.
 *  - **the choice sticks.** It is stored by `id` in `ui/store.ts` and survives a reload, so the
 *    player arranges this screen once rather than every time they open the tab.
 *
 * `defaultOpen` is what it does before anybody has touched it. Absent preferences are not written,
 * so changing a default later is not fighting a stored choice from months ago.
 */
export function Section({ id, title, count, info, defaultOpen = true, children }: {
  id: string;
  title: string;
  count?: number;
  /** An `<Info>`/`<Term>` for the heading; it sits inside the button and does not toggle it. */
  info?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const open = useStore(s => isOpen(s, id, defaultOpen));
  return (
    <>
      <div className="section-title fold-head">
        <button type="button" className="fold-btn" onClick={() => toggleFold(id, !open)} aria-expanded={open} aria-controls={`fold-${id}`}>
          <Icon name="caret" size={12} className={open ? 'flip' : ''} />
          <span>{title}</span>
          {count !== undefined && <span className="fold-n">{count}</span>}
        </button>
        {info}
      </div>
      <div id={`fold-${id}`} hidden={!open}>{children}</div>
    </>
  );
}
