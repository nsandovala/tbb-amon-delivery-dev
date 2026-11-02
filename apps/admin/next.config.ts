import type { NextConfig } from "next";

/**
 * HOSTING-SPIKE-01: `NEXT_OUTPUT=export` genera un sitio estático (`out/`) para
 * Firebase Hosting. Sin esa variable, el build no cambia.
 */
const isStaticExport = process.env.NEXT_OUTPUT === "export";

/**
 * DEPLOY-READY-01: `AMON_BUILD_TARGET=production` solo lo fija
 * `tools/build-hosting.mjs`, después de validar el entorno. Se inyecta siempre
 * como literal para que `src/lib/public-env.ts` elimine del bundle las ramas
 * locales en producción.
 */
const buildTarget = process.env.AMON_BUILD_TARGET === "production" ? "production" : "local";
if (buildTarget === "production" && !isStaticExport) {
  throw new Error("AMON_BUILD_TARGET=production requiere NEXT_OUTPUT=export (usa tools/build-hosting.mjs).");
}

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      images: { unoptimized: true },
      env: { AMON_BUILD_TARGET: buildTarget },
    }
  : {
      env: { AMON_BUILD_TARGET: buildTarget },
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
