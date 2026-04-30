"use client";

import { use, useEffect, useState } from "react";
import { getTenantBySlug } from "@/lib/firebase/queries/tenants";
import { getTenantCategories } from "@/lib/firebase/queries/categories";
import { getTenantProducts } from "@/lib/firebase/queries/products";
import { featuredStores } from "@/lib/data/featured-stores";
import { StoreHeader } from "@/components/store/store-header";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { HeroSection } from "@/components/store/hero-section";
import { StorefrontClient } from "@/components/store/storefront-client";
import { ComingSoonStore } from "@/components/store/coming-soon-store";
import type { Category, Product, Tenant } from "@/types";

interface StorePageProps {
  params: Promise<{ slug: string }>;
}

export default function StorePage({ params }: StorePageProps) {
  const { slug } = use(params);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if this is a "coming soon" simulated store
  const soonStore = featuredStores.find(
    (s) => s.slug === slug && s.status === "soon"
  );

  useEffect(() => {
    // Skip Firebase loading for simulated "coming soon" stores
    if (soonStore) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadStorefront() {
      try {
        setLoading(true);
        setError(null);

        const nextTenant = await getTenantBySlug(slug);
        if (cancelled) return;

        if (!nextTenant) {
          setTenant(null);
          setCategories([]);
          setProducts([]);
          return;
        }

        const [nextCategories, nextProducts] = await Promise.all([
          getTenantCategories(nextTenant.id),
          getTenantProducts(nextTenant.id),
        ]);

        if (cancelled) return;

        setTenant(nextTenant);
        setCategories(nextCategories);
        setProducts(nextProducts);
      } catch (loadError) {
        if (cancelled) return;
        const message =
          loadError instanceof Error
            ? loadError.message
            : "No pudimos cargar la tienda.";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadStorefront();

    return () => {
      cancelled = true;
    };
  }, [slug, soonStore]);

  // Render coming-soon page for simulated stores
  if (soonStore) {
    return <ComingSoonStore store={soonStore} />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center flex-col gap-4">
        <h1 className="text-2xl font-bold text-white">Cargando tienda</h1>
        <p className="text-neutral-400">Estamos trayendo el cat&aacute;logo de {slug}.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center flex-col gap-4">
        <h1 className="text-2xl font-bold text-white">Algo sali&oacute; mal</h1>
        <p className="text-neutral-400">{error}</p>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center flex-col gap-4">
        <h1 className="text-2xl font-bold text-white">Tienda no encontrada</h1>
        <p className="text-neutral-400">No existe una tienda con el slug &quot;{slug}&quot;.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0B] relative flex flex-col pb-24 overflow-x-hidden">
      {/* Background Subtle Glow */}
      <div className="pointer-events-none fixed inset-0 z-0 flex justify-center">
        <div className="absolute top-[-20%] w-[1000px] aspect-square bg-[radial-gradient(circle,rgba(0,255,156,0.08),transparent_70%)] opacity-80" />
      </div>

      <div className="relative z-10 w-full">
        <StoreHeader tenantName={tenant.name} />
      </div>

      <main className="relative z-10 flex-1 w-full max-w-[1400px] mx-auto flex flex-col">
        <HeroSection />

        <StorefrontClient 
          categories={categories} 
          products={products} 
          city={tenant.location?.city} 
        />
      </main>

      {/* Cart Drawer */}
      <CartDrawer tenantId={tenant.id} />
    </div>
  );
}
