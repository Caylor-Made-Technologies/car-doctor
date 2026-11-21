import type { ReactNode } from 'react';
import { Button } from './Button';

/** Circuit-trace art for empty and error states (original artwork, decorative). */
function TraceArt({ broken }: { broken?: boolean }) {
  return (
    <svg className="state-art" viewBox="0 0 160 96" aria-hidden="true" focusable="false" data-broken={broken || undefined}>
      <path className="state-trace" d="M8 72H44L60 56H88" />
      <path className="state-trace" d={broken ? 'M104 56H112L128 40H152' : 'M88 56H112L128 40H152'} />
      <path className="state-trace state-trace-2" d="M24 88H70L84 74H136" />
      <circle className="state-pad" cx="152" cy="40" r="5" />
      <circle className="state-pad" cx="136" cy="74" r="4" />
      <circle className="state-pad" cx="8" cy="72" r="4" />
      {broken && <path className="state-gap" d="M90 48l4 16M100 48l4 16" />}
    </svg>
  );
}

export interface StateAction { label: string; href?: string; onClick?: () => void }

function StateBox({ kind, title, children, action, secondary }: { kind: 'empty' | 'error'; title: string; children?: ReactNode; action?: StateAction; secondary?: StateAction }) {
  return (
    <div className="state-box" role={kind === 'error' ? 'alert' : 'status'}>
      <TraceArt broken={kind === 'error'} />
      <h2 className="state-title">{title}</h2>
      {children && <div className="state-body">{children}</div>}
      {(action || secondary) && (
        <div className="state-actions">
          {action && (action.href ? <Button variant="primary" href={action.href}>{action.label}</Button> : <Button variant="primary" onClick={action.onClick}>{action.label}</Button>)}
          {secondary && (secondary.href ? <Button href={secondary.href}>{secondary.label}</Button> : <Button onClick={secondary.onClick}>{secondary.label}</Button>)}
        </div>
      )}
    </div>
  );
}

/** Nothing here yet: say why, and offer the next step. */
export function EmptyState(p: { title: string; children?: ReactNode; action?: StateAction; secondary?: StateAction }) {
  return <StateBox kind="empty" {...p} />;
}

/** Something went wrong: say what, in plain words, and how to recover. */
export function ErrorState(p: { title: string; children?: ReactNode; action?: StateAction; secondary?: StateAction }) {
  return <StateBox kind="error" {...p} />;
}
