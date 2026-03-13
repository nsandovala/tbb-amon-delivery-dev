import Image from "next/image";

export function HeroSection() {
  return (
    <section className="relative w-full py-32 md:py-48 px-6 md:px-12 flex flex-col items-center justify-center text-center overflow-hidden min-h-[600px]">
      {/* Premium Apple-Style Food Background */}
      <div className="absolute inset-0 z-0">
        <Image 
          src="/images/stubs/burger-real.jpg"
          alt="Premium Burger"
          fill
          className="object-cover scale-105 saturate-[0.9] brightness-[0.5] contrast-[1.1]"
          priority
        />
        {/* Elegant Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0B0B]/90 via-[#0B0B0B]/40 to-[#0B0B0B]" />
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      </div>

      <div className="relative z-10 max-w-5xl">
        <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 px-5 py-2 rounded-full mb-12 backdrop-blur-2xl">
          <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_#00FF9C]" />
          <span className="text-[12px] font-bold text-white/90 uppercase tracking-[0.4em]">The Best Burger • Playa Ancha</span>
        </div>
        
        <h2 className="text-7xl md:text-[120px] font-bold tracking-[-0.05em] text-white mb-10 leading-[0.9] text-balance">
          El portal <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-[#00FF9C] to-[#00d1ff]">
            del hambre
          </span>
        </h2>
        
        <p className="text-xl md:text-3xl text-neutral-300 font-medium max-w-3xl mx-auto leading-tight tracking-tight drop-shadow-2xl">
          Ingredientes reales. <span className="text-white font-bold">Experiencias legendarias.</span> <br className="hidden md:block" />
          Tu próxima dimensión de sabor está lista.
        </p>
      </div>
      
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent shadow-[0_0_20px_rgba(255,255,255,0.05)]" />
    </section>
  );
}
