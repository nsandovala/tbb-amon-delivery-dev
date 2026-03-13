import { getTenantBySlug } from "@/lib/firebase/queries/tenants";
import { getTenantCategories } from "@/lib/firebase/queries/categories";
import { getTenantProducts } from "@/lib/firebase/queries/products";
import { StoreHeader } from "@/components/store/store-header";
import { ProductGrid } from "@/components/store/product-grid";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { HeroSection } from "@/components/store/hero-section";
import { CategoryChips } from "@/components/store/category-chips";
import { StorefrontClient } from "@/components/store/storefront-client";

interface StorePageProps {
  params: Promise<{ slug: string }>;
}

export default async function StorePage({ params }: StorePageProps) {
  const { slug } = await params;

  const tenant = await getTenantBySlug(slug);

  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center flex-col gap-4">
        <h1 className="text-2xl font-bold text-white">Tienda no encontrada</h1>
        <p className="text-neutral-400">No existe una tienda con el slug &quot;{slug}&quot;.</p>
      </div>
    );
  }

  const [categories, products] = await Promise.all([
    getTenantCategories(tenant.id),
    getTenantProducts(tenant.id),
  ]);

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