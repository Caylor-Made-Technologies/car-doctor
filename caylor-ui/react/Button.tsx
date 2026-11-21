import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';
interface Common { variant?: Variant; size?: 'md' | 'sm'; block?: boolean; icon?: ReactNode; children?: ReactNode; className?: string }
type Props = Common & (
  | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'>)
  | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>)
);

/** The one button (caylor-ui 1.0.0). `href` makes it a link. Icon-only buttons need an aria-label. Always ≥ 44 px. */
export function Button(props: Props) {
  const { variant = 'default', size = 'md', block, icon, children, className, ...rest } = props;
  const c = ['btn', variant !== 'default' && `btn-${variant}`, size === 'sm' && 'btn-sm', block && 'btn-block', !children && 'btn-icon', className].filter(Boolean).join(' ');
  const inner = <>{icon}{children}</>;
  if (rest.href !== undefined) return <a className={c} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>{inner}</a>;
  return <button type="button" className={c} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>{inner}</button>;
}
