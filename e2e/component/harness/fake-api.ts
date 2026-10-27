/**
 * API falsa para las pruebas de componente (O-05). Cada llamada queda en
 * `window.__calls` con su promesa pendiente: la prueba decide CUÁNDO y CÓMO
 * responde cada una (201, 200, error HTTP o de red), en cualquier orden.
 * No hay red, Firebase ni servidor.
 */
type PendingCall = {
  fn: string;
  args: unknown[];
  settled: boolean;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

type HarnessWindow = Window & {
  __calls?: PendingCall[];
  __respond?: (index: number, value: unknown) => void;
  __fail?: (index: number, kind: "network" | "http", status?: number, code?: string) => void;
};

const w = window as HarnessWindow;
w.__calls = w.__calls ?? [];

w.__respond = (index, value) => {
  const call = w.__calls![index];
  if (!call || call.settled) throw new Error(`Llamada ${index} inexistente o ya respondida`);
  call.settled = true;
  call.resolve(value);
};

w.__fail = (index, kind, status, code) => {
  const call = w.__calls![index];
  if (!call || call.settled) throw new Error(`Llamada ${index} inexistente o ya respondida`);
  call.settled = true;
  call.reject(
    kind === "network"
      ? new TypeError("Failed to fetch")
      : Object.assign(new Error(code ?? `HTTP ${status}`), { status, code })
  );
};

function pending<T>(fn: string, args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    w.__calls!.push({ fn, args, settled: false, resolve: resolve as (v: unknown) => void, reject });
  });
}

// Web
export const createOrderApi = (...args: unknown[]) => pending("createOrderApi", args);
export const lookupOrderAttemptApi = (...args: unknown[]) => pending("lookupOrderAttemptApi", args);
export const fetchPublicStoreAvailability = (...args: unknown[]) => pending("fetchPublicStoreAvailability", args);
// POS
export const createPosSaleApi = (...args: unknown[]) => pending("createPosSaleApi", args);
export const lookupPosAttemptApi = (...args: unknown[]) => pending("lookupPosAttemptApi", args);
export const getOrderApi = (...args: unknown[]) => pending("getOrderApi", args);
// Compartida
export const updateOrderStatusApi = (...args: unknown[]) => pending("updateOrderStatusApi", args);
