import { z } from "zod";
import { idempotencyKeySchema } from "../lib/idempotency";
import { DOCUMENT_ID_PATTERN, ORDER_LIMITS } from "./order-limits";

/**
 * FIN-01 — contratos de entrada de confirmación y reversión de transferencias.
 * Contrato: docs/architecture/payment-confirmation-contract.md
 */

const documentIdSchema = z
  .string()
  .min(1)
  .max(ORDER_LIMITS.maxIdLength)
  .regex(DOCUMENT_ID_PATTERN, "Invalid document ID");

/** Cuerpos chicos: rechazados antes de tocar Firestore (COST-GUARD). */
export const PAYMENT_BODY_MAX_BYTES = 2 * 1024;

export const confirmTransferPaymentSchema = z.object({
  tenantId: documentIdSchema,
  orderId: documentIdSchema,
  /** Total que el operador vio en pantalla; debe coincidir con `totals.total`. */
  expectedAmount: z.number().int("expectedAmount must be whole CLP").positive(),
  /** Últimos dígitos o folio de la operación. Nunca número de cuenta ni RUT. */
  reference: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9 #._-]*$/, "reference may only contain letters, digits, space and #._-")
    .optional()
    .transform((value) => (value ? value : undefined)),
  idempotencyKey: idempotencyKeySchema,
});

export const revertTransferConfirmationSchema = z.object({
  tenantId: documentIdSchema,
  orderId: documentIdSchema,
  /** Evento de confirmación vigente que el operador quiere revertir. */
  expectedConfirmationEventId: documentIdSchema,
  reason: z.string().trim().min(5, "reason must be at least 5 characters").max(280),
  idempotencyKey: idempotencyKeySchema,
});

export const listPaymentEventsQuerySchema = z
  .object({
    tenantId: documentIdSchema,
    orderId: documentIdSchema.optional(),
    operationalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((value) => Boolean(value.orderId) !== Boolean(value.operationalDate), {
    message: "Provide exactly one of orderId or operationalDate",
  });

export type ConfirmTransferPaymentInput = z.infer<typeof confirmTransferPaymentSchema>;
export type RevertTransferConfirmationInput = z.infer<typeof revertTransferConfirmationSchema>;
export type ListPaymentEventsQuery = z.infer<typeof listPaymentEventsQuerySchema>;
