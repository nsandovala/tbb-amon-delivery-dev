import type { AnchorHTMLAttributes, ReactNode } from "react";
/** Shim de framework: `next/link` como enlace normal (sin router de Next). */
export default function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  return <a href={href} {...rest}>{children}</a>;
}
