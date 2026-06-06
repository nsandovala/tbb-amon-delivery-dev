import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
