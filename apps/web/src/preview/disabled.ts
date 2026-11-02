/**
 * TBB-TABLET-PREVIEW-01 — piezas comunes de la vista previa.
 *
 * `PREVIEW_MARKER` queda en el bundle de la vista previa: `tools/build-preview.mjs`
 * exige encontrarlo en `out/` y `tools/build-hosting.mjs` lo rechaza en un build
 * productivo, para que este código nunca llegue a producción.
 */
export const PREVIEW_MARKER = "amon-preview-build";

/**
 * Error de negocio (4xx) con el mismo formato que `apiFetch`: la UI lo muestra
 * como rechazo definitivo y el intento de compra no queda pendiente.
 */
export function previewDisabled(action: string): Error & { code: string; status: number } {
  return Object.assign(new Error(`Vista previa: ${action} está deshabilitado.`), {
    code: "PREVIEW_DISABLED",
    status: 403,
  });
}
