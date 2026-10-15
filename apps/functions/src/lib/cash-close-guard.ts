import admin from "firebase-admin";
import { ConflictError } from "./errors";
import { storeRefs } from "../repositories/firestore-store.repo";

/** A closed cash day is an immutable financial boundary. */
export async function assertCashCloseOpen(
  tx: admin.firestore.Transaction,
  tenantId: string,
  operationalDate: string
): Promise<void> {
  const close = await tx.get(storeRefs(tenantId).cashClose(operationalDate));
  if (close.exists) {
    throw new ConflictError(
      `La jornada ${operationalDate} ya fue cerrada en caja; no se permiten cambios retroactivos.`
    );
  }
}
