import { useEffect, useRef, type ReactNode, type TouchEvent } from 'react';
import { backSheet, closeSheets, useStore } from '@ui/store';
import { Icon } from '@ui/icons';

const SWIPE_CLOSE_PX = 90;

/**
 * Generic bottom sheet. Back pops the sheet stack; close clears it. Closes on backdrop tap,
 * the close button, a swipe down on the handle/header, or the big Close at the bottom of the body.
 * Never covers the HUD, and lifts itself above the on-screen keyboard while an input has focus.
 * `onClose` / `onBack` override the sheet-stack behaviour for sheets that live outside it (help).
 */
export function Sheet({ title, subtitle, icon, children, accent, onClose, onBack, footer = true }: {
  title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; children: ReactNode; accent?: string; onClose?: () => void; onBack?: () => void; footer?: boolean;
}) {
  const depth = useStore(s => s.sheets.length);
  const close = onClose ?? closeSheets;
  const back = onBack ?? (depth > 1 ? backSheet : undefined);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ y0: 0, dy: 0, active: false });

  // Keep the sheet above the software keyboard (iOS keeps fixed elements behind it otherwise).
  useEffect(() => {
    const vv = window.visualViewport; const el = ref.current;
    if (!vv || !el) return;
    const apply = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const kb = covered > 80; // anything smaller is browser chrome, not a keyboard
      el.style.bottom = kb ? `${covered}px` : '';
      el.style.maxHeight = kb ? `${Math.max(240, vv.height - 8)}px` : '';
    };
    vv.addEventListener('resize', apply); vv.addEventListener('scroll', apply);
    return () => { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply); };
  }, []);

  const onStart = (e: TouchEvent) => { drag.current = { y0: e.touches[0].clientY, dy: 0, active: true }; if (ref.current) ref.current.style.transition = 'none'; };
  const onMove = (e: TouchEvent) => {
    if (!drag.current.active || !ref.current) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y0);
    drag.current.dy = dy;
    ref.current.style.transform = `translateY(${dy}px)`;
  };
  const onEnd = () => {
    const { dy, active } = drag.current; drag.current.active = false;
    const el = ref.current; if (!el || !active) return;
    if (dy > SWIPE_CLOSE_PX) { close(); return; }
    el.style.transition = 'transform 0.18s ease-out'; el.style.transform = '';
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={close} />
      <div ref={ref} className="sheet" role="dialog" aria-label={typeof title === 'string' ? title : undefined} style={accent ? { borderTopColor: accent, borderTopWidth: 3 } : undefined}>
        <div className="sheet-handle" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
          <div className="sheet-grab" />
          <div className="sheet-head">
            {back && <button type="button" className="iconbtn" onClick={back} aria-label="Back"><Icon name="caret" size={16} className="rot90" /></button>}
            {icon && <span className="sheet-ico">{typeof icon === 'string' ? <Icon name={icon} size={20} /> : icon}</span>}
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="sheet-title ellipsis">{title}</div>
              {subtitle && <div className="sheet-sub ellipsis">{subtitle}</div>}
            </div>
            <button type="button" className="iconbtn" onClick={close} aria-label="Close"><Icon name="cross" size={16} /></button>
          </div>
        </div>
        <div className="sheet-body">
          {children}
          {footer && (
            <div className="sheet-foot">
              {back && <button type="button" className="btn btn-ghost" onClick={back}>‹ Back</button>}
              <button type="button" className="btn" onClick={close}>Close</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
