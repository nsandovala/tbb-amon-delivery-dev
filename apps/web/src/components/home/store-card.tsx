"use client";

import Link from "next/link";
import Image from "next/image";
import type { FeaturedStore } from "@/lib/data/featured-stores";

interface StoreCardProps {
  store: FeaturedStore;
}

export function StoreCard({ store }: StoreCardProps) {
  const { slug, name, tagline, description, location, image, tags, status, metrics, isActive } = store;

  const statusConfig = {
    open: { label: "Abierto", className: "bg-accent/10 text-accent border-accent/20" },
    closed: { label: "Cerrado", className: "bg-red-500/10 text-red-400 border-red-500/20" },
    soon: { label: "Próximamente", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  };

  const currentStatus = statusConfig[status];

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-card/80 backdrop-blur-sm transition-all duration-300 hover:border-accent/20 hover:shadow-[0_0_30px_rgba(0,255,156,0.08)] hover:-translate-y-1 ${
        !isActive ? "opacity-60" : ""
      }`}
    >
      {/* Banner image */}
      <div className="relative h-44 w-full overflow-hidden">
        <Image
          src={image}
          alt={name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          priority={false}
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />

        {/* Status badge */}
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${currentStatus.className}`}
          >
            {status === "open" && (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            )}
            {currentStatus.label}
          </span>
        </div>

        {/* Inactive overlay */}
        {!isActive && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        {/* Name + tagline */}
        <div className="mb-2">
          <h3 className="text-lg font-semibold text-white transition-colors group-hover:text-accent">
            {name}
          </h3>
          <p className="text-sm text-neutral-400">{tagline}</p>
        </div>

        {/* Location */}
        <div className="mb-3 flex items-center gap-1.5 text-xs text-neutral-500">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          {location}
        </div>

        {/* Description */}
        <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-neutral-400">
          {description}
        </p>

        {/* Tags */}
        <div className="mb-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/5 bg-white/5 px-3 py-1 text-xs font-medium text-neutral-300"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Metrics */}
        {metrics && (
          <div className="mb-4 grid grid-cols-3 gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
            {metrics.rating && (
              <div className="text-center">
                <p className="text-sm font-semibold text-white">{metrics.rating}</p>
                <p className="text-[10px] uppercase tracking-wide text-neutral-500">Rating</p>
              </div>
            )}
            {metrics.orders && (
              <div className="text-center">
                <p className="text-sm font-semibold text-white">{metrics.orders}</p>
                <p className="text-[10px] uppercase tracking-wide text-neutral-500">Pedidos</p>
              </div>
            )}
            {metrics.deliveryTime && (
              <div className="text-center">
                <p className="text-sm font-semibold text-white">{metrics.deliveryTime}</p>
                <p className="text-[10px] uppercase tracking-wide text-neutral-500">Entrega</p>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <div className="mt-auto">
          {isActive ? (
            <Link
              href={`/tienda/${slug}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent border border-accent/20 transition-all duration-200 hover:bg-accent hover:text-black hover:shadow-[0_0_20px_rgba(0,255,156,0.25)]"
            >
              Ver tienda
              <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <button
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-neutral-500"
            >
              Próximamente
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
