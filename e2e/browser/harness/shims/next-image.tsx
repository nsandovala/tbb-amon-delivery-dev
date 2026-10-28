/* eslint-disable @next/next/no-img-element */
/** Shim de framework: `next/image` sin optimizador de imágenes (no hay servidor Next). */
export default function Image({ src, alt, fill: _fill, priority: _priority, sizes: _sizes, quality: _quality, ...rest }: Record<string, unknown>) {
  const url = typeof src === "string" ? src : (src as { src?: string } | undefined)?.src ?? "";
  return <img src={url} alt={String(alt ?? "")} {...rest} />;
}
