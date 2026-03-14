"use client";

import { cn } from "@/lib/utils";
import type { Category } from "@/types";

interface CategoryChipsProps {
  categories: Category[];
  activeCategoryId: string;
  onSelectCategory?: (id: string) => void;
}

export function CategoryChips({
  categories,
  activeCategoryId,
  onSelectCategory,
}: CategoryChipsProps) {
  const fallbackChips = [
    { id: "", name: "Menú" },
    { id: "aumenta-tu-ki", name: "Aumenta tu ki" },
    { id: "multiverso-burger", name: "Multiverso Burger" },
    { id: "multiverso-mechada", name: "Multiverso Mechada" },
    { id: "papas-kaioken", name: "Papas Kaioken" },
    { id: "bebidas-og", name: "Bebidas Oficiales" },
  ];

  const chips =
    categories && categories.length > 0
      ? [
          { id: "", name: "Menú" },
          ...categories.map((c) => ({ id: c.id, name: c.name })),
        ]
      : fallbackChips;

  return (
    <div className="sticky top-[72px] z-40 border-y border-white/5 bg-[#0B0B0B]/88 backdrop-blur-xl">
      <div
        className="
          overflow-x-auto overflow-y-hidden
          px-4 py-4 md:px-8
          [scrollbar-width:none]
          [-ms-overflow-style:none]
          [&::-webkit-scrollbar]:hidden
        "
      >
        <div className="flex w-max min-w-full gap-3 md:justify-center">
          {chips.map((chip) => {
            const isActive =
              chip.id === ""
                ? activeCategoryId === ""
                : activeCategoryId === chip.id;

            return (
              <button
                key={chip.id || "all"}
                onClick={() => onSelectCategory?.(chip.id)}
                className={cn(
                  "relative shrink-0 overflow-hidden rounded-full border",
                  "px-5 py-3 md:px-6",
                  "text-[11px] md:text-[12px] font-semibold uppercase",
                  "tracking-[0.18em] whitespace-nowrap",
                  "transition-all duration-300 ease-out",
                  "backdrop-blur-md active:scale-[0.98]",
                  isActive
                    ? [
                        "border-[#00FF9C]/30 text-[#B8FFE8]",
                        "bg-[rgba(255,255,255,0.03)]",
                        "shadow-[0_0_0_1px_rgba(0,255,156,0.08),inset_0_0_0_1px_rgba(255,255,255,0.03),0_0_18px_rgba(0,255,156,0.08)]",
                      ]
                    : [
                        "border-white/10 text-white/80",
                        "bg-[rgba(255,255,255,0.025)]",
                        "hover:border-white/20 hover:text-white hover:bg-[rgba(255,255,255,0.04)]",
                      ]
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none absolute inset-[1px] rounded-full",
                    isActive
                      ? "bg-[radial-gradient(circle_at_center,rgba(0,255,156,0.18)_0%,rgba(0,255,156,0.08)_38%,rgba(0,255,156,0.00)_72%)]"
                      : "bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.008))]"
                  )}
                />
                <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-white/10" />
                <span className="relative z-10">{chip.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}