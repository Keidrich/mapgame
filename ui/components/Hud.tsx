import { useEffect, useRef } from 'react';
import { fmtMoneyShort } from '@ui/derive';
import { openHelp, useWorld } from '@ui/store';
import { select } from '@sim/index';
import { POSTURES } from '@content/authority';
import { Icon } from '@ui/icons';
import { Term } from './Info';

/**
 * The top readout.
 *
 * It used to be two rows of whatever fitted, and every pass since has added something else that
 * had to fit: wire heat, a posture, a lawyer, jail days. Three bands now, in the order you would
 * actually read them under pressure:
 *
 *   1. **Identity** — which day it is, where you are standing, and any flag that changes what
 *      the day means (the law is looking, you are inside, you have a lawyer).
 *   2. **The strip** — the four numbers the whole game is played against, each in its own cell
 *      with a tracked-out label above it and the number in mono underneath. Cells rather than a
 *      row of text is what stops them jostling when one of them grows a digit.
 *   3. **The budget** — what you have left *today*: action points as pips, legwork, and the two
 *      reputation numbers that everything social reads.
 *
 * Nothing here computes anything; every value is already on the world or in `select`.
 */
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
  const heat = Math.max(0, Math.min(100, p.heat));
  const posture = select.topPosture(w);
  return (
    <header className="hud" ref={ref}>
      <div className="hud-top">
        <div className="hud-id">
          <span className="hud-day">DAY {w.day}</span>
          <span className="hud-place ellipsis" title={w.placeName}>{w.placeName}</span>
        </div>
        <div className="hud-flags">
          {p.lawyer && <Term id="lawyer"><span className="hud-flag gold"><Icon name="lawyer" size={12} />Lawyer</span></Term>}
          {posture !== 'routine' && (
            <Term id="posture"><span className="hud-flag red"><Icon name={posture} size={12} />{POSTURES[posture].label}</span></Term>
          )}
          {p.jailedDays > 0 && <span className="hud-flag red"><Icon name="jail" size={12} />{p.jailedDays}d</span>}
          <button type="button" className="hud-help" onClick={openHelp} aria-label="How to play">?</button>
        </div>
      </div>

      <div className="hud-strip">
        <div className="hud-cell cash">
          <span className="k"><Icon name="cash" size={11} /><Term id="cash">Clean</Term></span>
          <span className="v">{fmtMoneyShort(p.cash)}</span>
        </div>
        <div className="hud-cell dirty">
          <span className="k"><Icon name="dirty" size={11} /><Term id="dirty">Dirty</Term></span>
          <span className="v">{fmtMoneyShort(p.dirty)}</span>
        </div>
        <div className={`hud-cell heat${heat >= 60 ? ' hot' : ''}`}>
          <span className="k"><Icon name="heat" size={11} /><Term id="heat">Heat</Term></span>
          <span className="v">{Math.round(p.heat)}</span>
          <span className={`bar${heat < 60 ? ' calm' : ''}`}><i style={{ width: `${heat}%` }} /></span>
        </div>
        <div className="hud-cell">
          <span className="k"><Icon name="respect" size={11} /><Term id="respect">Rep</Term></span>
          <span className="v sm">{Math.round(p.respect)} <span className="muted">/</span> {Math.round(p.fear)}</span>
          <span className="k" style={{ fontSize: 8 }}><Term id="fear">respect / fear</Term></span>
        </div>
      </div>

      <div className="hud-budget">
        <div className="pips" aria-label={`${p.ap} of ${p.apMax} action points`}>
          {Array.from({ length: Math.max(p.apMax, p.ap) }, (_, i) => <span key={i} className={`pip${i < p.ap ? ' on' : ''}`} />)}
        </div>
        <span className="tac"><span className="n">{p.ap}/{p.apMax}</span> <Term id="ap">AP</Term></span>
        <span className="tac"><Icon name="legwork" size={12} className="tac-gold" style={{ display: 'inline-block', verticalAlign: -2 }} /> <span className="n">{p.legwork}/{p.legworkMax}</span> <Term id="legwork">legwork</Term></span>
      </div>
    </header>
  );
}
