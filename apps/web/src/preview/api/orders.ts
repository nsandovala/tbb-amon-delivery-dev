import type * as Real from "@/lib/api/orders";
import { previewDisabled } from "@/preview/disabled";

/**
 * TBB-TABLET-PREVIEW-01 — reemplaza `src/lib/api/orders.ts`. Sin Functions: crear
 * o consultar pedidos falla con `PREVIEW_DISABLED` y no se hace ninguna solicitud.
 * La disponibilidad de la tienda es informativa; sin respuesta, no se muestra.
 */
export type {
  OrderAttemptLookup,
  PublicStoreAvailability,
  PublicStoreDateException,
} from "@/lib/api/orders";

export const fetchPublicStoreAvailability: typeof Real.fetchPublicStoreAvailability = async () => {
  throw previewDisabled("consultar el estado de la tienda");
};

export const lookupOrderAttemptApi: typeof Real.lookupOrderAttemptApi = async () => {
  throw previewDisabled("verificar pedidos");
};

export const createOrderApi: typeof Real.createOrderApi = async () => {
  throw previewDisabled("enviar pedidos");
};

export const updateOrderStatusApi: typeof Real.updateOrderStatusApi = async () => {
  throw previewDisabled("cambiar el estado de pedidos");
};
