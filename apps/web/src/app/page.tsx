import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-[#ededed]">
      {/* Header */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/5 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="text-xs font-semibold uppercase tracking-widest text-accent">
            AMON Shop
          </span>
          <nav className="flex items-center gap-4">
            <a
              href="#stores"
              className="text-xs text-zinc-500 transition-colors hover:text-accent"
            >
              Tiendas
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-4 pt-14 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,255,156,0.05),transparent_55%)]" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1 text-xs uppercase tracking-widest text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_4px_#00FF9C]" />
            Marcha blanca · Piloto activo
          </div>

          <h1 className="mb-4 bg-gradient-to-b from-[#ededed] to-[#555] bg-clip-text text-6xl font-bold tracking-tight text-transparent sm:text-7xl md:text-8xl">
            AMON Shop
          </h1>

          <p className="mb-4 max-w-lg text-base text-zinc-300 sm:text-lg">
            Sistema inteligente de pedidos y operación para negocios locales.
          </p>

          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Cada tienda opera con su propia identidad, menú y flujo de pedidos.
            Delivery es solo un módulo; la base es vender mejor, ordenar la
            operación y crecer con datos reales.
          </p>

          <p className="mb-10 text-xs italic text-zinc-700">
            Del hambre al orden operativo. Sin magia negra, solo pedidos bien
            encaminados.
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="#stores"
              className="rounded border border-accent px-6 py-2.5 text-sm font-medium text-accent transition-all hover:bg-accent/10 hover:shadow-[0_0_20px_rgba(0,255,156,0.2)]"
            >
              Explorar tiendas
            </a>
          </div>
        </div>
      </section>

      {/* Stores */}
      <section id="stores" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-[#ededed] sm:text-3xl">
            Explora nuestro ecosistema
          </h2>
          <p className="mt-2 text-xs text-zinc-600">
            Tiendas activas y en preparación.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* The Best Burger — featured */}
          <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-card p-6 transition-all hover:border-accent/30 hover:shadow-[0_0_40px_rgba(0,255,156,0.06)] lg:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_#00FF9C]" />
              <span className="text-xs text-accent">Activa</span>
            </div>

            <h3 className="mb-1 text-2xl font-bold text-[#ededed]">
              The Best Burger
            </h3>
            <p className="mb-4 text-xs text-zinc-500">
              Receta de la Abuela · Valparaíso, Chile
            </p>

            <p className="mb-5 text-sm leading-relaxed text-zinc-400">
              Burger y mechadas artesanales con identidad propia, pedidos en
              vivo y retiro o delivery según operación.
            </p>

            <div className="mb-6 flex flex-wrap gap-2">
              {["Pedidos online", "Retiro", "Delivery opcional"].map(
                (badge) => (
                  <span
                    key={badge}
                    className="rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-xs text-accent"
                  >
                    {badge}
                  </span>
                )
              )}
            </div>

            <Link
              href="/tienda/tbb"
              className="inline-flex items-center gap-2 rounded border border-accent px-5 py-2 text-sm font-medium text-accent transition-all hover:bg-accent/10 hover:shadow-[0_0_16px_rgba(0,255,156,0.2)]"
            >
              Ver tienda →
            </Link>
          </div>

          {/* Coming soon column */}
          <div className="flex flex-col gap-6">
            {[
              { name: "Sushi Zen", sub: "Cocina japonesa" },
              { name: "Forno Nero", sub: "Pizzería artesanal" },
            ].map(({ name, sub }) => (
              <div
                key={name}
                className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/5 bg-card p-6"
              >
                <div className="select-none text-center opacity-20">
                  <p className="text-lg font-bold text-[#ededed]">{name}</p>
                  <p className="text-xs text-zinc-500">{sub}</p>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full border border-white/10 bg-background/80 px-4 py-1.5 text-xs text-zinc-500 backdrop-blur-sm">
                    Próximamente
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 text-center">
        <p className="text-xs text-zinc-700">
          AMON Shop · Sistema de pedidos y operación
        </p>
      </footer>
    </main>
  );
}
