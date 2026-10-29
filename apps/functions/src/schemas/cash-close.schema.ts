import { z } from "zod";

/**
 * POST /closeCashSession — payload. Contrato: docs/architecture/store-operation-contract.md
 * FIN-CLOSE-01: `discrepancy` (motivo + aceptación + cifras vistas por el operador).
 * D3: `transfersEntryMode` / `ledgerSuggestion` (procedencia del importe de transferencias).
 */

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const closeCashSessionInputSchema = z
  .object({
    tenantId: z.string().min(1).optional(),
    operationalDate: z.string().regex(DATE_REGEX).optional(),
    countedCash: z.number().int("countedCash must be whole CLP").min(0),
    transfersConfirmed: z.number().int("transfersConfirmed must be whole CLP").min(0),
    observation: z.string().trim().max(500).optional(),
    override: z
      .object({ reason: z.string().trim().min(5, "Override reason must be at least 5 characters").max(280) })
      .optional(),
    // FIN-CLOSE-01: diferencias financieras declaradas con motivo y aceptación.
    discrepancy: z
      .object({
        reason: z.string().trim().min(10, "Discrepancy reason must be at least 10 characters").max(280),
        acknowledged: z.literal(true),
        cashDifference: z.number().int(),
        collectionDifference: z.number().int(),
      })
      .optional(),
    // D3: procedencia del importe de transferencias. Omitido = manual.
    transfersEntryMode: z.enum(["manual", "ledger_suggestion"]).default("manual"),
    ledgerSuggestion: z
      .object({ suggestedAmount: z.number().int().min(0), bankVerified: z.literal(true) })
      .optional(),
    idempotencyKey: z.string().trim().min(8).max(100),
  })
  .superRefine((value, ctx) => {
    if (value.transfersEntryMode === "ledger_suggestion") {
      if (!value.ledgerSuggestion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ledgerSuggestion"],
          message: "ledger_suggestion requires ledgerSuggestion with bankVerified: true",
        });
      } else if (value.ledgerSuggestion.suggestedAmount !== value.transfersConfirmed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transfersConfirmed"],
          message: "transfersConfirmed differs from the ledger suggestion; send transfersEntryMode manual",
        });
      }
    } else if (value.ledgerSuggestion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ledgerSuggestion"],
        message: "ledgerSuggestion is only allowed with transfersEntryMode ledger_suggestion",
      });
    }
  });
export type CloseCashSessionInput = z.infer<typeof closeCashSessionInputSchema>;
