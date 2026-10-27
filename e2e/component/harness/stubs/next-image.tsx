/* eslint-disable @next/next/no-img-element */
export default function Image({ src, alt, fill: _fill, priority: _p, sizes: _s, ...rest }: Record<string, unknown>) {
  return <img src={typeof src === "string" ? src : ""} alt={String(alt ?? "")} {...rest} />;
}
