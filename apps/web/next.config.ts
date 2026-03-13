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
};

export default nextConfig;
