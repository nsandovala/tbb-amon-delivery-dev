import StorePage from "./store-page";

/**
 * HOSTING-SPIKE-01: en un build estático (`NEXT_OUTPUT=export`) cada tienda se
 * genera de antemano. Los slugs salen de `NEXT_PUBLIC_STORE_SLUGS` (separados
 * por coma; por defecto `tbb`). Agregar una tienda requiere volver a construir.
 * Con servidor Next (dev o standalone) cualquier slug sigue resolviéndose al vuelo.
 * Los datos de la tienda se cargan igual que antes, desde el navegador.
 */
export function generateStaticParams() {
  return (process.env.NEXT_PUBLIC_STORE_SLUGS ?? "tbb")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean)
    .map((slug) => ({ slug }));
}

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <StorePage params={params} />;
}
