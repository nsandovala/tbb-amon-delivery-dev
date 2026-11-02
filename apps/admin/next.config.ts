import type { NextConfig } from "next";

/**
 * HOSTING-SPIKE-01: `NEXT_OUTPUT=export` genera un sitio estático (`out/`) para
 * Firebase Hosting. Sin esa variable, el build no cambia.
 */
const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      images: { unoptimized: true },
    }
  : {
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
