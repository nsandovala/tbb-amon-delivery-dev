/**
 * COST-GUARD v1 — límites de entrada para pedidos (web y POS).
 *
 * Acotan el trabajo máximo de una sola solicitud ANTES de tocar Firestore:
 * cada línea de carrito con un producto distinto cuesta una lectura, así que
 * `MAX_ORDER_LINES` es también el tope de lecturas de productos por pedido.
 * Los valores dejan amplio margen sobre un carrito real de TBB (pocas líneas,
 * cantidades de un dígito) y sobre pedidos grupales.
 */
export const ORDER_LIMITS = {
  /** Líneas de carrito por pedido (= tope de lecturas de productos). */
  maxLines: 25,
  /** Unidades por línea. */
  maxQtyPerLine: 50,
  /** Unidades totales del pedido, sumando todas las líneas. */
  maxTotalUnits: 200,
  /** IDs de documento Firestore (tenant y producto). */
  maxIdLength: 128,
  maxCustomerNameLength: 100,
  maxPhoneLength: 32,
  maxEmailLength: 254,
  maxAddressLength: 300,
  maxNotesLength: 500,
  /** Cuerpo JSON crudo de createOrder/createPosSale. */
  maxBodyBytes: 16 * 1024,
} as const;

/** ID de documento Firestore seguro: sin `/`, sin `.`/`..`, acotado. */
export const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
