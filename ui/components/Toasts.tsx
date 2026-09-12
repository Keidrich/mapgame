import { useStore } from '@ui/store';

/**
 * Toasts sit above the End Day button by default. While a sheet is open they move up under the
 * HUD; while a modal (event / scene) is open they go to the very top, over the dimmed HUD.
 */
export function Toasts() {
  const toasts = useStore(s => s.toasts);
  const modal = useStore(s => !!s.scene || (s.world?.pendingEvents.length ?? 0) > 0);
  const sheet = useStore(s => s.sheets.length > 0 || s.help);
  if (!toasts.length) return null;
  const pos = modal ? ' over' : sheet ? ' top' : '';
  return (
    <div className={`toasts${pos}`} aria-live="polite">
      {toasts.map(t => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
    </div>
  );
}
