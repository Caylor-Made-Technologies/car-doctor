import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';

/** Keeps a node mounted long enough for its exit transition. */
function usePresence(open: boolean, exitMs = 260) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);
  return { mounted, shown };
}

/** Bottom sheet on phones, centered dialog on wide screens (caylor-ui 1.0.0). Esc / backdrop close; focus is trapped and restored. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const { mounted, shown } = usePresence(open);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => (ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>('input, select, textarea, button, a[href]'))?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
  if (!mounted) return null;
  return (
    <>
      <div className="sheet-backdrop" data-shown={shown} onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="sheet" data-shown={shown}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id={id} className="sheet-title">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close" icon={<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>} />
        </div>
        {children}
      </div>
    </>
  );
}
