/**
 * Firestore simulado: productos desde `window.__products`; órdenes vacías.
 * Solo lo que usa la página POS.
 */
type Ref = { path: string };
export const collection = (_db: unknown, path: string): Ref => ({ path });
export const query = (ref: Ref, ..._constraints: unknown[]): Ref => ref;
export const where = (..._args: unknown[]) => ({});
export const orderBy = (..._args: unknown[]) => ({});
export const limit = (..._args: unknown[]) => ({});
export const Timestamp = {
  fromMillis: (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }),
};
export function onSnapshot(ref: Ref, next: (snapshot: unknown) => void) {
  const products = ((window as unknown as { __products?: Record<string, unknown>[] }).__products ?? []);
  const rows = ref.path.endsWith("/products") ? products : [];
  queueMicrotask(() =>
    next({ docs: rows.map((row) => ({ id: String(row.id), data: () => row })) })
  );
  return () => {};
}
