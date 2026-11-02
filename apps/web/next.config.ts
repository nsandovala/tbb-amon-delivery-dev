import type { NextConfig } from "next";

/**
 * HOSTING-SPIKE-01: `NEXT_OUTPUT=export` genera un sitio estático (`out/`) para
 * Firebase Hosting. Sin esa variable, el build sigue siendo `standalone` como hasta ahora.
 * El sitio estático no tiene servidor: sin rewrites, sin optimizador de imágenes
 * ni server actions (la app no usa ninguno en producción).
 */
const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",

  // Evitar re-renders innecesarios en dev
  reactStrictMode: true,

  ...(isStaticExport
    ? {
        // Sin servidor no hay optimizador: las imágenes se sirven tal cual desde el CDN.
        images: { unoptimized: true },
      }
    : {
        // Firebase SDK usa ESM — asegurar compatibilidad
        experimental: {
          serverActions: {
            bodySizeLimit: "2mb",
          },
        },
        // Proxy same-origin para Firebase Functions Emulator (evita CORS/PNA en navegador).
        // Solo existe con servidor Next; el build estático llama directo a Functions.
        async rewrites() {
          return [
            {
              source: "/api/functions/:path*",
              destination: "http://127.0.0.1:5001/minerp-sentinel/us-central1/:path*",
            },
          ];
        },
      }),
};

export default nextConfig;
