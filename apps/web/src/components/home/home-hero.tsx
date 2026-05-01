"use client";

import Link from "next/link";
import { ParticleField } from "@/components/store/particle-field";

export function HomeHero() {
  return (
    <section className="relative flex min-h-[85vh] w-full flex-col items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/4 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 animate-[pulse_6s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle,rgba(0,255,156,0.07),transparent_70%)] blur-3xl" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute left-1/4 top-1/3 h-px w-32 -translate-y-1/2 animate-[pulse_5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
        <div className="absolute right-1/4 top-2/3 h-px w-48 -translate-y-1/2 animate-[pulse_7s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-accent/10 to-transparent" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Interactive particles */}
      <ParticleField />

      <div className="relative z-10 flex max-w-4xl flex-col items-center text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-5 py-2 shadow-[0_0_20px_rgba(0,255,156,0.06)] backdrop-blur-xl">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(0,255,156,0.5)]" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-neutral-200">
            Geolocalizaci&oacute;n activa &middot; Tiendas cercanas
          </span>
        </div>

        {/* Title */}
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl lg:text-8xl">
          AMON{" "}
          <span className="bg-gradient-to-r from-accent to-emerald-400 bg-clip-text text-transparent">
            Shop
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mb-3 text-lg font-medium text-neutral-200 sm:text-xl">
          Vende con retiro, delivery o env&iacute;os nacionales. Tu negocio, tu reglas.
        </p>

        {/* Description */}
        <p className="mb-10 max-w-xl text-base leading-relaxed text-neutral-400 sm:text-lg">
          Infraestructura comercial para emprendedores. Activa tu tienda en minutos.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Link
            href="#stores"
            className="group inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-8 py-3.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-accent-hover hover:shadow-[0_0_25px_rgba(0,255,156,0.3)] active:scale-[0.98]"
          >
            Crear mi tienda
            <svg
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </Link>

          <Link
            href="#stores"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:border-accent/30 hover:bg-white/10 hover:text-accent active:scale-[0.98]"
          >
            Explorar tiendas cercanas
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Link>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <div className="flex flex-col items-center gap-2 text-neutral-600">
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">Scroll</span>
          <div className="flex h-8 w-5 items-start justify-center rounded-full border border-neutral-700/60">
            <div className="mt-1.5 h-1 w-1 animate-bounce rounded-full bg-accent shadow-[0_0_6px_rgba(0,255,156,0.5)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
