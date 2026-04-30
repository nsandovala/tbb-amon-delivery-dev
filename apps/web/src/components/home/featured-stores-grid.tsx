"use client";

import { StoreCard } from "./store-card";
import { featuredStores } from "@/lib/data/featured-stores";

export function FeaturedStoresGrid() {
  return (
    <section id="stores" className="relative w-full px-4 py-20 sm:px-6 lg:px-8">
      {/* Section background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,255,156,0.04),transparent_70%)] blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-accent">
              Tiendas destacadas
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Explora nuestro{" "}
              <span className="bg-gradient-to-r from-accent to-emerald-400 bg-clip-text text-transparent">
                ecosistema
              </span>
            </h2>
          </div>
          <p className="max-w-sm text-sm text-neutral-400">
            Cada tienda opera de forma independiente con su propia identidad, men&uacute; y flujo de pedidos.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {featuredStores.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <div className="h-px w-24 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <p className="text-sm text-neutral-500">
            &iquest;Tienes un negocio?{" "}
            <span className="text-neutral-300">
              Pronto podr&aacute;s unirte a la plataforma AMON.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
