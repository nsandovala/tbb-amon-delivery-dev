type User = { email?: string };
export function onAuthStateChanged(auth: { currentUser: User | null }, next: (user: User | null) => void) {
  queueMicrotask(() => next(auth.currentUser));
  return () => {};
}
