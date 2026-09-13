import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY } from '@content/glossary';

/**
 * Explainers. `Term` turns a label into something you can tap (phone) or hover (desktop)
 * to find out what the number means; `Info` is a standalone ? for a section.
 *
 * One popover at a time, rendered into <body> so a sheet's scrolling and swipe transform
 * cannot clip it. Closes on the next tap, a scroll, or Escape.
 */

let closeCurrent: (() => void) | null = null;
const finePointer = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

interface Content { title: string; body: string; note?: string }
function lookup(id?: string, title?: string, body?: string, note?: string): Content | null {
  const g = id ? GLOSSARY[id] : undefined;
  const t = title ?? g?.title; const b = body ?? g?.body;
  if (!t || !b) return null;
  return { title: t, body: b, note: note ?? g?.note };
}

function usePopover(content: Content | null) {
  const anchor = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const close = useCallback(() => {
    setOpen(false); setPos(null);
    if (closeCurrent === close) closeCurrent = null;
  }, []);

  const show = useCallback(() => {
    if (!content) return;
    if (closeCurrent && closeCurrent !== close) closeCurrent();
    closeCurrent = close;
    setOpen(true);
  }, [content, close]);

  // Place it under the label, flipping above when there is no room, always inside the screen.
  useLayoutEffect(() => {
    if (!open) return;
    const a = anchor.current, p = pop.current;
    if (!a || !p) return;
    const r = a.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    const M = 8;
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(M, Math.min(left, vw - pw - M));
    let top = r.bottom + 6;
    if (top + ph > vh - M) top = r.top - ph - 6;          // flip above
    if (top < M) top = Math.max(M, vh - ph - M);          // still no room: pin to the bottom
    setPos({ left, top });
  }, [open]);

  // Any tap elsewhere, any scroll, Escape or a resize dismisses it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (anchor.current?.contains(t) || pop.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  useEffect(() => () => { if (closeCurrent === close) closeCurrent = null; }, [close]);

  const handlers = {
    onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); open ? close() : show(); },
    onPointerEnter: () => {
      if (!finePointer()) return;
      hoverTimer.current = setTimeout(show, 120);
    },
    onPointerLeave: () => {
      if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
      if (finePointer()) close();
    },
  };

  const node = open && content
    ? createPortal(
        <div
          ref={pop}
          className="pop"
          role="tooltip"
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
        >
          <b className="pop-title">{content.title}</b>
          <p className="pop-body">{content.body}</p>
          {content.note && <p className="pop-note">{content.note}</p>}
        </div>,
        document.body,
      )
    : null;

  return { anchor, handlers, node, open };
}

export interface ExplainProps {
  /** A key in content/glossary.ts. */
  id?: string;
  /** Overrides, for one-off explanations that do not belong in the glossary. */
  title?: string;
  body?: string;
  note?: string;
}

/**
 * A label that explains itself. Renders its children plainly (no dead affordance) when the
 * term is unknown, so a typo degrades to ordinary text rather than a broken button.
 */
export function Term({ id, title, body, note, children, className = '' }: ExplainProps & { children: ReactNode; className?: string }) {
  const content = lookup(id, title, body, note);
  const { anchor, handlers, node, open } = usePopover(content);
  if (!content) return <>{children}</>;
  return (
    <>
      <button ref={anchor} type="button" className={`term${open ? ' on' : ''} ${className}`} aria-label={`What is ${content.title}?`} {...handlers}>
        {children}
      </button>
      {node}
    </>
  );
}

/** A standalone ? next to a heading or a row. */
export function Info({ id, title, body, note, className = '' }: ExplainProps & { className?: string }) {
  const content = lookup(id, title, body, note);
  const { anchor, handlers, node, open } = usePopover(content);
  if (!content) return null;
  return (
    <>
      <button ref={anchor} type="button" className={`infodot${open ? ' on' : ''} ${className}`} aria-label={`What is ${content.title}?`} {...handlers}>?</button>
      {node}
    </>
  );
}

/** A chip that explains itself: the common case for traits and status flags. */
export function TermChip({ id, title, body, note, children, style, tone, className = '' }: ExplainProps & { children: ReactNode; style?: React.CSSProperties; tone?: string; className?: string }) {
  const content = lookup(id, title, body, note);
  const { anchor, handlers, node, open } = usePopover(content);
  const css = { ...(tone ? { color: tone } : {}), ...style };
  if (!content) return <span className={`chip ${className}`} style={css}>{children}</span>;
  return (
    <>
      <button ref={anchor} type="button" className={`chip chip-term ${className}${open ? ' on' : ''}`} style={css} aria-label={`What is ${content.title}?`} {...handlers}>
        {children}
      </button>
      {node}
    </>
  );
}
