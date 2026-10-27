import { setGlobalOptions } from "firebase-functions/v2";

/**
 * COST-GUARD v1 — límites de escalado de TODAS las Functions (2.ª gen).
 *
 * Debe importarse antes que las rutas (ver `index.ts`): cada `onRequest`
 * toma las opciones globales vigentes al definirse.
 *
 * - `maxInstances: 5`: tope duro de instancias por función. El piloto maneja
 *   decenas de pedidos al día; 5 instancias con la concurrencia por defecto
 *   absorben picos legítimos y acotan cuánto puede escalar (y facturar) un
 *   abuso. No es un tope de gasto: las solicitudes extra reciben 429/503.
 * - `minInstances: 0`: sin instancias calientes facturadas en reposo
 *   (se acepta el arranque en frío).
 * - `timeoutSeconds: 30`: ninguna operación legítima se acerca a eso; corta
 *   solicitudes colgadas antes que el valor por defecto (60 s).
 * - `memory: "256MiB"`: el valor por defecto, fijado explícitamente.
 * - `region: "us-central1"`: la región que ya usan los clientes.
 *
 * El emulador ignora estos límites; solo aplican al desplegar. Cambiarlos para
 * producción requiere un PR (no hay valores distintos por entorno).
 */
setGlobalOptions({
  region: "us-central1",
  maxInstances: 5,
  minInstances: 0,
  timeoutSeconds: 30,
  memory: "256MiB",
});
