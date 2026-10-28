/** Shim de framework: router de Next sin navegación real (las pruebas no cambian de ruta). */
const router = { push: () => {}, replace: () => {}, back: () => {}, refresh: () => {}, prefetch: () => {} };
export const useRouter = () => router;
export const usePathname = () => "/pos";
export const useSearchParams = () => new URLSearchParams(window.location.search);
