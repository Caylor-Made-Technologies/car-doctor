import type { CSSProperties } from 'react';

/** A shimmering placeholder block (caylor-ui 1.0.0). Size it with a class or `height`. */
export function Skeleton({ className = '', height, width }: { className?: string; height?: number | string; width?: number | string }) {
  const style: CSSProperties | undefined = height || width ? { height, width } : undefined;
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}
