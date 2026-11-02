import path from "node:path";
import type { NextConfig } from "next";

/**
 * HOSTING-SPIKE-01: `NEXT_OUTPUT=export` genera un sitio estático (`out/`) para
 * Firebase Hosting. Sin esa variable, el build sigue siendo `standalone` como hasta ahora.
 * El sitio estático no tiene servidor: sin rewrites, sin optimizador de imágenes
 * ni server actions (la app no usa ninguno en producción).
 */
const isStaticExport = process.env.NEXT_OUTPUT === "export";

/**
 * DEPLOY-READY-01: `AMON_BUILD_TARGET=production` solo lo fija
 * `tools/build-hosting.mjs`, después de validar el entorno. Se inyecta siempre
 * como literal para que `src/lib/public-env.ts` elimine del bundle las ramas
 * locales en producción.
 */
const buildTarget =
  process.env.AMON_BUILD_TARGET === "production"
    ? "production"
    : process.env.AMON_BUILD_TARGET === "preview"
      ? "preview"
      : "local";
if (buildTarget !== "local" && !isStaticExport) {
  throw new Error(`AMON_BUILD_TARGET=${buildTarget} requiere NEXT_OUTPUT=export (usa tools/build-hosting.mjs).`);
}

/**
 * TBB-TABLET-PREVIEW-01: en la vista previa (`AMON_BUILD_TARGET=preview`, solo vía
 * `tools/build-preview.mjs`) estos módulos se sustituyen al compilar por los de
 * `src/preview/`: la carta sale del seed y todo lo que crea pedidos falla con
 * `PREVIEW_DISABLED`. El SDK de Firebase y las URLs de Functions no llegan al bundle.
 * Los demás builds no cambian. Ver docs/architecture/tablet-preview-contract.md.
 */
const PREVIEW_MODULES: Record<string, string> = {
  "src/lib/firebase/client.ts": "src/preview/firebase-client.ts",
  "src/lib/firebase/queries/tenants.ts": "src/preview/queries/tenants.ts",
  "src/lib/firebase/queries/categories.ts": "src/preview/queries/categories.ts",
  "src/lib/firebase/queries/products.ts": "src/preview/queries/products.ts",
  "src/lib/api/orders.ts": "src/preview/api/orders.ts",
  "src/components/store/pending-order-notice.tsx": "src/preview/preview-notice.tsx",
};

type ResolvedModule = { createData?: { resource?: string; request?: string; userRequest?: string } };

const previewWebpack: NonNullable<NextConfig["webpack"]> = (config, { webpack }) => {
  const replacements = new Map(
    Object.entries(PREVIEW_MODULES).map(([from, to]) => [path.join(__dirname, from), path.join(__dirname, to)])
  );
  config.plugins.push(
    new webpack.NormalModuleReplacementPlugin(/[\\/]src[\\/]/, (resolveData: ResolvedModule) => {
      // Solo tras resolver (ruta absoluta); antes de resolver no hay `createData`.
      const createData = resolveData.createData;
      const original = createData?.resource;
      const target = original ? replacements.get(original) : undefined;
      if (!createData || !original || !target) return;
      createData.resource = target;
      createData.request = createData.request?.replace(original, target);
      createData.userRequest = createData.userRequest?.replace(original, target);
    })
  );
  return config;
};

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",

  env: { AMON_BUILD_TARGET: buildTarget },

  ...(buildTarget === "preview"
    ? {
        // La carta demo importa el seed de packages/shared/src (fuera de la app).
        experimental: { externalDir: true },
        webpack: previewWebpack,
      }
    : {}),

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
