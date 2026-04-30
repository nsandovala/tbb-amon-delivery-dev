"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import type { FeaturedStore } from "@/lib/data/featured-stores";
import { Clock, MapPin, ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComingSoonStoreProps {
  store: FeaturedStore;
}

export function ComingSoonStore({ store }: ComingSoonStoreProps) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0B0B0B] px-4 py-24 text-center">
      {/* Background ambient glow */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,255,156,0.06),transparent_70%)]" />
      </div>

      {/* Floating particles canvas */}
      <ParticleField />

      <div className="relative z-10 flex max-w-lg flex-col items-center gap-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 backdrop-blur-xl">
          <Clock className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">
            Próximamente
          </span>
        </div>

        {/* Store image */}
        <div className="relative h-32 w-32 overflow-hidden rounded-3xl border border-white/10 shadow-[0_0_40px_rgba(0,255,156,0.08)]">
          <Image
            src={store.image}
            alt={store.name}
            fill
            className="object-cover saturate-[0.8] brightness-[0.6]"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-white/20" />
          </div>
        </div>

        {/* Text */}
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            {store.name}
          </h1>
          <p className="text-lg font-medium text-neutral-400">
            {store.tagline}
          </p>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-neutral-500">
            {store.description}
          </p>
        </div>

        {/* Location & time */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <div className="flex items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-neutral-400">
            <MapPin className="h-3.5 w-3.5 text-neutral-500" />
            {store.location}
          </div>
          {store.metrics?.deliveryTime && (
            <div className="flex items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-neutral-400">
              <Clock className="h-3.5 w-3.5 text-neutral-500" />
              {store.metrics.deliveryTime}
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap justify-center gap-2">
          {store.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/5 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-neutral-400"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* CTA */}
        <Link
          href="/"
          className={cn(
            "group inline-flex items-center gap-2 rounded-2xl border px-6 py-3 text-sm font-semibold transition-all duration-300",
            "border-white/10 bg-white/[0.04] text-white",
            "hover:border-accent/20 hover:bg-accent/10 hover:text-accent"
          )}
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Volver al inicio
        </Link>

        {/* Notify interest */}
        <p className="text-[11px] font-medium text-neutral-600">
          Te avisaremos cuando {store.name} esté disponible.
        </p>
      </div>
    </div>
  );
}

/* Lightweight particle field for the coming-soon background */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = [];
    const COUNT = 40;

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles();
    }

    function initParticles() {
      particles.length = 0;
      for (let i = 0; i < COUNT; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          size: Math.random() * 1.2 + 0.3,
          alpha: Math.random() * 0.12 + 0.04,
        });
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = "#00FF9C";
        ctx!.globalAlpha = p.alpha;
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[1]"
      style={{ mixBlendMode: "screen" }}
    />
  );
}
