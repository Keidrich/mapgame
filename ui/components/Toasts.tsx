import { useStore } from '@ui/store';

export function Toasts() {
  const toasts = useStore(s => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(t => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
    </div>
  );
}
