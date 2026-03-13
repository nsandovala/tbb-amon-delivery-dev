"use client";

import { cn } from "@/lib/utils";
import type { Category } from "@/types";

interface CategoryChipsProps {
  categories: Category[];
  activeCategoryId: string;
  onSelectCategory?: (id: string) => void;
  hoveredCategoryId?: string | null;
}

export function CategoryChips({
  categories,
  activeCategoryId,
  onSelectCategory,
  hoveredCategoryId
}: CategoryChipsProps) {
  const hasCategories = categories && categories.length > 0;

  const baseChipClass =
    "whitespace-nowrap px-8 py-3 rounded-full text-[13px] font-bold uppercase tracking-widest transition-all duration-300 snap-start border backdrop-blur-3xl shrink-0";

  const activeChipClass =
    "bg-[#00FF9C]/12 border-[#00FF9C]/50 text-[#00FF9C] shadow-[inset_0_0_20px_rgba(0,255,156,0.35),0_0_18px_rgba(0,255,156,0.10)] scale-[1.03]";

  const hoverChipClass =
    "bg-white/10 border-white/30 text-white shadow-[inset_0_0_15px_rgba(255,255,255,0.05)]";

  const idleChipClass =
    "bg-white/5 border-white/10 text-neutral-400 hover:border-white/30 hover:text-white";

  return (
    <div className="w-full sticky top-[72px] z-40 bg-[#0B0B0B]/80 backdrop-blur-xl border-y border-white/5">
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-6">
        <div className="flex gap-4 overflow-x-auto md:justify-center scrollbar-hide snap-x pb-1">
          <button
            onClick={() => onSelectCategory?.("")}
            className={cn(
              baseChipClass,
              (!activeCategoryId || activeCategoryId === "")
                ? activeChipClass
                : hoveredCategoryId === ""
                  ? hoverChipClass
                  : idleChipClass
            )}
          >
            Todo el menú
          </button>

          {hasCategories ? (
            categories.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectCategory?.(c.id)}
                className={cn(
                  baseChipClass,
                  activeCategoryId === c.id
                    ? activeChipClass
                    : hoveredCategoryId === c.id
                      ? hoverChipClass
                      : idleChipClass
                )}
              >
                {c.name}
              </button>
            ))
          ) : (
            [
              { id: "multiverso-burger", label: "Burgers" },
              { id: "multiverso-mechada", label: "Mechadas" },
              { id: "papas-kaioken", label: "Papas" },
              { id: "bebidas-og", label: "Bebidas" }
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectCategory?.(c.id)}
                className={cn(
                  baseChipClass,
                  activeCategoryId === c.id
                    ? activeChipClass
                    : hoveredCategoryId === c.id
                      ? hoverChipClass
                      : idleChipClass
                )}
              >
                {c.label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}