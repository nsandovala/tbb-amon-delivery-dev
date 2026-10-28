import type { APIResponse, Page, Request, Route } from "@playwright/test";

/**
 * Capa de transporte entre el navegador y el emulador de Functions.
 *
 * Hace lo mismo que el rewrite `/api/functions/*` de Next (proxy same-origin
 * al emulador) y además permite a la prueba controlar el tiempo y la pérdida:
 * - `forward()`: envía la petición original al backend real y guarda su respuesta.
 * - `deliver()`: entrega al navegador la respuesta real (la reenvía si hace falta).
 * - `loseResponse()`: el backend la procesa, pero la respuesta no llega (red).
 * - `dropBeforeServer()`: la petición nunca llega al backend (red).
 * Nada de lo que responde el backend se inventa: solo se demora o se pierde.
 */
export const FUNCTIONS_BASE =
  process.env.FUNCTIONS_BASE_URL ??
  `http://127.0.0.1:5001/${process.env.FIREBASE_PROJECT_ID ?? "minerp-sentinel"}/us-central1/`;

export class HeldRequest {
  response: APIResponse | null = null;
  private done = false;
  constructor(
    readonly fn: string,
    private readonly route: Route,
    private readonly target: string
  ) {}

  get request(): Request {
    return this.route.request();
  }

  json<T = Record<string, unknown>>(): T {
    return JSON.parse(this.request.postData() ?? "null") as T;
  }

  /** Envía al backend real (opcionalmente con otro cuerpo) y guarda la respuesta. */
  async forward(postData?: unknown): Promise<APIResponse> {
    if (!this.response) {
      this.response = await this.route.fetch({
        url: this.target,
        ...(postData === undefined ? {} : { postData: JSON.stringify(postData) }),
      });
    }
    return this.response;
  }

  async deliver(): Promise<void> {
    const response = await this.forward();
    this.settle();
    await this.route.fulfill({ response });
  }

  async loseResponse(): Promise<void> {
    await this.forward();
    this.settle();
    await this.route.abort("failed");
  }

  async dropBeforeServer(): Promise<void> {
    this.settle();
    await this.route.abort("failed");
  }

  private settle() {
    if (this.done) throw new Error(`${this.fn}: la petición ya se resolvió`);
    this.done = true;
  }
}

export class Transport {
  private readonly held = new Map<string, HeldRequest[]>();
  private readonly waiters: (() => void)[] = [];

  constructor(private readonly page: Page, private readonly control: string[]) {}

  async install(): Promise<void> {
    await this.page.route(/\/api\/functions\//, async (route) => {
      const url = new URL(route.request().url());
      const rest = url.pathname.replace(/^\/api\/functions\//, "") + url.search;
      const fn = rest.split(/[/?]/)[0];
      const target = new URL(rest, FUNCTIONS_BASE).toString();
      if (!this.control.includes(fn)) {
        const response = await route.fetch({ url: target });
        await route.fulfill({ response });
        return;
      }
      const list = this.held.get(fn) ?? [];
      list.push(new HeldRequest(fn, route, target));
      this.held.set(fn, list);
      this.waiters.splice(0).forEach((wake) => wake());
    });
  }

  /** La n-ésima petición (desde 0) a `fn` retenida por la prueba. */
  async next(fn: string, nth = 0, timeoutMs = 15_000): Promise<HeldRequest> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.held.get(fn)?.[nth];
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`No llegó la petición ${fn} #${nth}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 200);
      });
    }
  }

  count(fn: string): number {
    return this.held.get(fn)?.length ?? 0;
  }
}
