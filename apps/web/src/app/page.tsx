import { HomeHero } from "@/components/home/home-hero";
import { FeaturedStoresGrid } from "@/components/home/featured-stores-grid";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-background overflow-x-hidden">
      {/* Global subtle top glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-0 h-[800px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(0,255,156,0.03),transparent_60%)]" />
      </div>

      <main className="relative z-10">
        <HomeHero />
        <FeaturedStoresGrid />
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-neutral-500">
            &copy; {new Date().getFullYear()} AMON Shop. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-neutral-600">Powered by</span>
            <span className="text-xs font-semibold text-accent">AMON</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
