import type { ReactNode } from 'react';
import { backSheet, closeSheets, useStore } from '@ui/store';

/** Generic bottom sheet. Back pops the sheet stack; close clears it. */
export function Sheet({ title, subtitle, icon, children, accent }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; children: ReactNode; accent?: string }) {
  const depth = useStore(s => s.sheets.length);
  return (
    <>
      <div className="sheet-backdrop" onClick={closeSheets} />
      <div className="sheet" role="dialog" aria-label={typeof title === 'string' ? title : undefined} style={accent ? { borderTopColor: accent, borderTopWidth: 3 } : undefined}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          {depth > 1 && <button type="button" className="iconbtn" onClick={backSheet} aria-label="Back">‹</button>}
          {icon && <span style={{ fontSize: 24, flex: 'none' }}>{icon}</span>}
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="sheet-title ellipsis">{title}</div>
            {subtitle && <div className="sheet-sub ellipsis">{subtitle}</div>}
          </div>
          <button type="button" className="iconbtn" onClick={closeSheets} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}
