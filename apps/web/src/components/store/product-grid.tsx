"use client";

import type { Product } from "@/types";
import { ProductCard } from "./product-card";

interface ProductGridProps {
  products: Product[];
  onHoverCategory?: (id: string | null) => void;
}

export function ProductGrid({ products, onHoverCategory }: ProductGridProps) {
  if (products.length === 0) {
    return <p className="text-neutral-500">No hay productos activos.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {products.map((p) => (
        <ProductCard 
          key={p.id} 
          product={p} 
          onHoverCategory={onHoverCategory} 
        />
      ))}
    </div>
  );
}
