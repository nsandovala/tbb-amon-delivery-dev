import Link from "next/link";

/* ─── Inline SVG icons (zero deps) ───────────────────────── */

const IconStore = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/>
    <path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 2.9h9.52a2 2 0 0 1 1.8 1.1L21 9"/>
    <path d="M12 2v7"/>
  </svg>
);

const IconPos = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20"/>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);

const IconOrders = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
    <path d="M3 6h18"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>
  </svg>
);

const IconTenant = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
  </svg>
);

/* ─── Particle field (CSS animated dots) ────────────────── */

function ParticleField() {
  const particles = Array.from({ length: 32 }, (_, i) => {
    const x = (i * 47.1 + 7.3) % 100;
    const y = (i * 61.9 + 2.1) % 100;
    const size = 1 + ((i * 11) % 2);
    const delay = (i * 0.5) % 7;
    const duration = 5 + ((i * 5) % 6);
    const drift = i % 2 === 0 ? "animate-particle" : "animate-particle-drift";
    return { x, y, size, delay, duration, drift };
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {particles.map((p, i) => (
        <div
          key={i}
          className={`absolute rounded-full ${p.drift}`}
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: i % 3 === 0 ? "#27f5a7" : i % 3 === 1 ? "#22d3ee" : "#ffffff",
            opacity: 0.1,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            filter: "blur(0.5px)",
          }}
        />
      ))}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────── */

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030712] text-[#f8fafc]">
      {/* ── Ambient Background ───────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#06101a,transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,#08111f,transparent_60%)]" />
        <ParticleField />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequen cy='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
            backgroundSize: "128px 128px",
          }}
        />
      </div>

      {/* ── Navbar ───────────────────────────────────────── */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.04] bg-[#030712]/60 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img
              src="/images/stubs/logoamon.jpg"
              alt="AMON"
              className="h-7 w-7 rounded-lg object-cover"
            />
            <span className="text-sm font-semibold tracking-tight text-[#f8fafc]">
              AMON <span className="text-[#27f5a7]">Shop</span>
            </span>
          </div>
          <nav className="flex items-center gap-3 sm:gap-5">
            <a href="#stores" className="hidden text-[11px] text-[#94a3b8] transition-colors hover:text-[#27f5a7] sm:inline">
              Tiendas
            </a>
            <a href="#capabilities" className="hidden text-[11px] text-[#94a3b8] transition-colors hover:text-[#27f5a7] sm:inline">
              Capacidades
            </a>
            <a href="#operation" className="hidden text-[11px] text-[#94a3b8] transition-colors hover:text-[#27f5a7] md:inline">
              Operación
            </a>
            <Link
              href="/tienda/tbb"
              className="rounded-full bg-[#27f5a7]/10 px-2.5 py-1 text-[11px] font-medium text-[#27f5a7] transition-all hover:bg-[#27f5a7]/20 sm:px-3 sm:py-1.5"
            >
              Ver tienda
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative flex min-h-[90vh] flex-col items-center justify-center px-4 pt-14 text-center">
        {/* Minimal glow — particles already float in background */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(39,245,167,0.04),transparent_70%)]" />
        </div>

        <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center">
          {/* Badge */}
          <div
            className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-[#27f5a7]/20 bg-[#27f5a7]/[0.06] px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-[#27f5a7] backdrop-blur-sm"
            style={{ animationDelay: "0.05s" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#27f5a7] shadow-[0_0_8px_#27f5a7]" />
            Multi-tenant · Pedidos · POS · Operación
          </div>

          {/* Title */}
          <h1
            className="animate-fade-up mb-5 text-4xl font-bold tracking-tight text-[#f8fafc] sm:text-5xl md:text-6xl"
            style={{ animationDelay: "0.15s" }}
          >
            AMON{" "}
            <span className="bg-gradient-to-r from-[#27f5a7] to-[#22d3ee] bg-clip-text text-transparent">
              Shop
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="animate-fade-up mb-3 max-w-lg text-base font-medium text-[#e2e8f0] sm:text-lg"
            style={{ animationDelay: "0.25s" }}
          >
            Tu tienda, tus pedidos y tu operación en un solo lugar.
          </p>

          {/* Description */}
          <p
            className="animate-fade-up mb-4 max-w-xl text-sm leading-relaxed text-[#94a3b8]"
            style={{ animationDelay: "0.35s" }}
          >
            Vende online, registra ventas en POS y coordina retiro o despacho
            sin enredar tu negocio.
          </p>

          {/* Microcopy */}
          <p
            className="animate-fade-up mb-8 text-xs text-[#475569]"
            style={{ animationDelay: "0.42s" }}
          >
            Menos fricción. Más control. Más ventas con orden.
          </p>

          {/* CTAs */}
          <div
            className="animate-fade-up flex flex-wrap justify-center gap-3"
            style={{ animationDelay: "0.5s" }}
          >
            <Link
              href="/tienda/tbb"
              className="group inline-flex items-center gap-2 rounded-full bg-[#27f5a7] px-6 py-2.5 text-sm font-semibold text-[#030712] transition-all hover:brightness-110 hover:shadow-[0_0_28px_rgba(39,245,167,0.35)]"
            >
              Explorar tienda piloto
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <a
              href="#capabilities"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 py-2.5 text-sm font-medium text-[#94a3b8] transition-all hover:border-[#27f5a7]/30 hover:text-[#27f5a7] hover:bg-[#27f5a7]/[0.04]"
            >
              Ver capacidades
            </a>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-[#030712] to-transparent" />
      </section>

      {/* ── Capabilities ─────────────────────────────────── */}
      <section id="capabilities" className="relative z-10 mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="mb-14 text-center">
          <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-[#27f5a7]/70">
            Capacidades
          </p>
          <h2 className="text-xl font-bold tracking-tight text-[#f8fafc] sm:text-2xl md:text-3xl">
            Operación comercial sin enredo
          </h2>
          <p className="mt-2 text-xs text-[#475569]">
            Cada módulo resuelve una parte real del flujo: vender, registrar, coordinar y controlar.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: <IconStore />,
              title: "Tienda online",
              desc: "Carta digital, carrito y pedido directo.",
            },
            {
              icon: <IconPos />,
              title: "POS Lite",
              desc: "Ventas manuales para caja, mostrador y WhatsApp.",
            },
            {
              icon: <IconOrders />,
              title: "Pedidos en vivo",
              desc: "Cola operativa para cocina, retiro y despacho.",
            },
            {
              icon: <IconTenant />,
              title: "Multi-tenant",
              desc: "Cada negocio conserva su identidad, catálogo y operación.",
            },
          ].map((cap) => (
            <div
              key={cap.title}
              className="group rounded-2xl border border-white/[0.04] bg-[rgba(10,18,32,0.45)] p-5 transition-all hover:border-[#27f5a7]/20 hover:bg-[rgba(10,18,32,0.65)] sm:p-6"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-[#27f5a7]/15 bg-[#27f5a7]/[0.06] text-[#27f5a7]">
                {cap.icon}
              </div>
              <h3 className="mb-1.5 text-sm font-semibold text-[#f8fafc]">
                {cap.title}
              </h3>
              <p className="text-xs leading-relaxed text-[#94a3b8]">
                {cap.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stores ───────────────────────────────────────── */}
      <section id="stores" className="relative z-10 mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="mb-14 text-center">
          <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-[#27f5a7]/70">
            Tiendas conectadas
          </p>
          <h2 className="text-xl font-bold tracking-tight text-[#f8fafc] sm:text-2xl md:text-3xl">
            Primero validamos con operación real
          </h2>
          <p className="mt-2 text-xs text-[#475569]">
            Luego escalamos.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* The Best Burger — featured editorial */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[rgba(10,18,32,0.45)] transition-all hover:border-[#27f5a7]/25 hover:shadow-[0_0_50px_rgba(39,245,167,0.05)] lg:col-span-2">
            <div className="grid h-full md:grid-cols-2">
              {/* Image */}
              <div className="relative min-h-[220px] overflow-hidden md:min-h-[360px]">
                <img
                  src="/images/stubs/burger-real.jpg"
                  alt="The Best Burger"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a1220] via-transparent to-transparent md:bg-gradient-to-l md:from-[#0a1220] md:via-[#0a1220]/30 md:to-transparent" />
                <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-[#27f5a7]/30 bg-[#030712]/70 px-3 py-1 text-xs text-[#27f5a7] backdrop-blur-sm">
                  <span className="h-2 w-2 rounded-full bg-[#27f5a7] shadow-[0_0_8px_#27f5a7]" />
                  Activa
                </div>
              </div>

              {/* Content */}
              <div className="flex flex-col justify-center p-6 md:p-8">
                <h3 className="mb-1 text-xl font-bold text-[#f8fafc] sm:text-2xl">
                  The Best Burger
                </h3>
                <p className="mb-4 text-xs uppercase tracking-wider text-[#475569]">
                  Receta de la Abuela · Valparaíso, Chile
                </p>

                <p className="mb-5 text-sm leading-relaxed text-[#94a3b8]">
                  Burgers y mechadas artesanales con pedidos online, POS y flujo operativo conectado.
                </p>

                <div className="mb-5 flex flex-wrap gap-2">
                  {["Pedidos online", "POS Lite", "Retiro", "Despacho coordinado"].map(
                    (badge) => (
                      <span
                        key={badge}
                        className="rounded-full border border-[#27f5a7]/15 bg-[#27f5a7]/[0.06] px-2.5 py-0.5 text-[11px] text-[#27f5a7]"
                      >
                        {badge}
                      </span>
                    )
                  )}
                </div>

                <Link
                  href="/tienda/tbb"
                  className="group/btn inline-flex w-fit items-center gap-2 rounded-full bg-[#27f5a7] px-5 py-2.5 text-sm font-semibold text-[#030712] transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(39,245,167,0.35)]"
                >
                  Ver tienda
                  <span className="transition-transform group-hover/btn:translate-x-1">→</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Coming soon — elegant secondary */}
          <div className="flex flex-col gap-5">
            {[
              { name: "Sushi Zen", sub: "Cocina japonesa" },
              { name: "Forno Nero", sub: "Pizzería artesanal" },
              { name: "Express Market", sub: "Minimarket local" },
            ].map(({ name, sub }) => (
              <div
                key={name}
                className="group relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/[0.06] bg-[rgba(10,18,32,0.15)] p-5 transition-all hover:border-[#27f5a7]/10 hover:bg-[rgba(10,18,32,0.25)]"
              >
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(39,245,167,0.02),transparent_70%)] opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative select-none text-center">
                  <p className="mb-1 text-base font-semibold text-[#f8fafc] opacity-25">{name}</p>
                  <p className="text-xs text-[#94a3b8] opacity-20">{sub}</p>
                </div>
                <span className="absolute bottom-4 rounded-full border border-white/[0.06] bg-[#030712]/70 px-3.5 py-1 text-[10px] uppercase tracking-wider text-[#475569] backdrop-blur-sm">
                  Próximamente
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Operation Block ────────────────────────────────── */}
      <section id="operation" className="relative z-10 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[rgba(10,18,32,0.55)] p-8 sm:p-12">
          {/* Ambient glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(39,245,167,0.04),transparent_70%)]" />

          <div className="relative z-10 mx-auto max-w-2xl text-center">
            <p className="mb-3 text-[11px] uppercase tracking-[0.25em] text-[#27f5a7]/70">
              Operación
            </p>
            <h2 className="mb-4 text-xl font-bold text-[#f8fafc] sm:text-2xl md:text-3xl">
              Listo para operar con más claridad
            </h2>
            <p className="mb-8 text-sm leading-relaxed text-[#94a3b8]">
              AMON Shop está pensado para negocios que necesitan vender, ordenar
              y crecer sin depender de sistemas pesados.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/tienda/tbb"
                className="inline-flex items-center gap-2 rounded-full bg-[#27f5a7] px-6 py-2.5 text-sm font-semibold text-[#030712] transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(39,245,167,0.35)]"
              >
                Explorar tienda piloto
                <span>→</span>
              </Link>
              <a
                href="#capabilities"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 py-2.5 text-sm font-medium text-[#94a3b8] transition-all hover:border-[#27f5a7]/30 hover:text-[#27f5a7]"
              >
                Ver capacidades
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.04] py-10 text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <img
            src="/images/stubs/logoamon.jpg"
            alt="AMON"
            className="h-5 w-5 rounded object-cover opacity-35"
          />
          <span className="text-xs text-[#475569]">
            AMON Shop · Sistema de pedidos y operación
          </span>
        </div>
        <p className="text-[10px] text-[#334155]">
          Valparaíso, Chile · 2026
        </p>
      </footer>
    </main>
  );
}
