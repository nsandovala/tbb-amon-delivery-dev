import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* ── Vercel + Firebase best practices ──────── */

  // Reduce cold-start: output standalone para Vercel
  output: "standalone",

  // Evitar re-renders innecesarios en dev
  reactStrictMode: true,

  // Firebase SDK usa ESM — asegurar compatibilidad
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },

  // Optimizar imports de Firebase (tree-shaking) - Removido porque rompe exports en v11

  // Proxy same-origin para Firebase Functions Emulator (evita CORS/PNA en navegador)
  async rewrites() {
    return [
      {
        source: "/api/functions/:path*",
        destination:
          "http://127.0.0.1:5001/minerp-sentinel/us-central1/:path*",
      },
    ];
  },
};

export default nextConfig;
