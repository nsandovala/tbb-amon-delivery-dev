"use client";

import { useState } from "react";
import type { Category, Product } from "@/types";
import { cn } from "@/lib/utils";
import { CategoryChips } from "./category-chips";
import { ProductGrid } from "./product-grid";

interface StorefrontClientProps {
  categories: Category[];
  products: Product[];
  city?: string;
}

const NEURO_PHRASES = [
  "Los favoritos del multiverso gastronómico",
  "Activa tu hambre en modo Kaioken",
  "Recetas legendarias desde Playa Ancha"
];

export function StorefrontClient({ categories, products, city }: StorefrontClientProps) {
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  const [phrase] = useState(() => NEURO_PHRASES[Math.floor(Math.random() * NEURO_PHRASES.length)]);

  const filteredProducts = activeCategoryId 
    ? products.filter(p => p.categoryId === activeCategoryId)
    : products;

  return (
    <div className="flex flex-col">
      {/* Category Selection */}
      <CategoryChips 
        categories={categories} 
        activeCategoryId={activeCategoryId}
        onSelectCategory={setActiveCategoryId}
        hoveredCategoryId={hoveredCategoryId}
      />

      <section className="px-6 md:px-12 flex-1 py-20 bg-[#0B0B0B]">
        <div className="flex flex-col mb-16 text-center gap-4 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight">
            {phrase}
          </h2>
          <p className="text-neutral-500 text-xs md:text-sm font-medium uppercase tracking-[0.4em]">
            Los Elegidos de {city || "tu dimensión"} • {filteredProducts.length} items
          </p>
          <div className="w-20 h-[2px] bg-accent/30 mx-auto mt-4 rounded-full" />
        </div>

        <ProductGrid 
          products={filteredProducts} 
          onHoverCategory={setHoveredCategoryId}
        />
      </section>
    </div>
  );
}
