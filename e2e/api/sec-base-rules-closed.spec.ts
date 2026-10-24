import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  FIRESTORE_DOCS,
  createFixtureTenant,
} from "../support/emulator-fixtures";

/**
 * SEC-BASE / CI-FIX — Fail-closed del motor de Firestore rules.
 *
 * El emulador de Firestore, cuando arranca sin un archivo de rules, aplica
 * reglas permisivas e imprime una advertencia de "Rules not available".
 * Si el CI omitiera `firestore.rules` por error (por ejemplo olvidando el
 * campo en `firebase.pilot.json`), toda la batería de pruebas negativas
 * pasaría en falso.
 *
 * Esta prueba intenta una escritura ANÓNIMA directa a un path privado y
 * verifica que la rule la rechace. Es una línea de defensa barata: si por
 * cualquier motivo el emulador queda abierto, esta prueba cae y bloquea el
 * CI antes de dar luz verde al despliegue.
 */
test("CI-FIX: Firestore rules están cargadas (write anónimo a path privado → 403)", async ({
  playwright,
  baseURL,
}) => {
  const request: APIRequestContext = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { "Content-Type": "application/json" },
  });

  // Tenant seed con token owner (bypass solo del emulador). El owner-token
  // emulador NO afecta rules evaluation para clientes anónimos del cliente
  // Firestore REST normal; es solo bypass para el fixture.
  const tenantId = await createFixtureTenant(request, "rules-closed");

  // Escritura anónima (sin header Authorization) contra una colección
  // declarada como `allow write: if false` + lectura privada.
  const res = await request.patch(
    `${FIRESTORE_DOCS}/tenants/${tenantId}/expenses/anonymous-poke`,
    {
      data: {
        fields: {
          id: { stringValue: "anonymous-poke" },
          tenantId: { stringValue: tenantId },
          amount: { integerValue: "1" },
        },
      },
    }
  );

  expect(
    res.status(),
    `Firestore rules appear OPEN (expected 403 for anonymous write, got ${res.status()}). ` +
      "Check that firebase.pilot.json includes firestore.rules."
  ).toBe(403);

  await request.dispose();
});
