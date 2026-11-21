import type { ElementType, HTMLAttributes, ReactNode } from 'react';

/** The one surface (caylor-ui 1.0.0). `glow` marks the one recommended thing on a screen. */
export function Card({ as, href, pad = true, glow, tone, className, children, ...rest }: { as?: ElementType; href?: string; pad?: boolean; glow?: boolean; tone?: 'ok' | 'warn' | 'alarm'; className?: string; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const Tag: ElementType = href ? 'a' : as ?? 'section';
  const c = ['card', pad && 'card-pad', href && 'card-link', glow && 'card-glow', tone && `card-${tone}`, className].filter(Boolean).join(' ');
  return <Tag className={c} href={href} {...rest}>{children}</Tag>;
}
