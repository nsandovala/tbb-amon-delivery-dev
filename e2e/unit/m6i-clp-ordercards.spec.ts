import { test, expect } from "@playwright/test";
import { formatClp, parseClpAmount } from "../../apps/admin/src/lib/clp";
import { getOrderItemLines } from "../../apps/admin/src/lib/orders";
import { OrderItemsSummary } from "../../apps/admin/src/components/order-items-summary";

/**
 * M6I — regresión puramente local (sin emulador, sin Firestore).
 * Run: npx playwright test e2e/unit --config=playwright.config.ts
 */

test.describe("parseClpAmount", () => {
  const ok: [string, number][] = [
    ["12000", 12000],
    ["12.000", 12000],
    ["1.200.000", 1200000],
    ["12", 12],
    ["  $ 12.000 ", 12000],
    ["999.999", 999999],
  ];
  for (const [input, value] of ok) {
    test(`acepta ${JSON.stringify(input)} -> ${value}`, () => {
      expect(parseClpAmount(input)).toEqual({ ok: true, value });
    });
  }

  const rejected: [string, string][] = [
    ["12,50", "decimal"],
    ["12.5", "decimal"],
    ["12.50", "decimal"],
    ["1.200,00", "decimal"],
    ["1.2000", "decimal"],
    ["", "empty"],
    ["   ", "empty"],
    ["-12000", "negative"],
    ["-12.000", "negative"],
    ["0", "zero"],
    ["000", "zero"],
    ["012", "invalid"],
    ["abc", "invalid"],
    ["12k", "invalid"],
    ["1e5", "invalid"],
  ];
  for (const [input, reason] of rejected) {
    test(`rechaza ${JSON.stringify(input)} (${reason})`, () => {
      const result = parseClpAmount(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe(reason);
        expect(result.message.length).toBeGreaterThan(0);
      }
    });
  }

  test("formatClp usa separador de miles chileno", () => {
    expect(formatClp(12000)).toBe("$12.000");
    expect(formatClp(1200000)).toBe("$1.200.000");
    expect(formatClp(12)).toBe("$12");
    expect(formatClp(undefined)).toBe("$0");
  });
});

test.describe("getOrderItemLines", () => {
  test("prioriza snapshot persistido, luego catálogo, luego productId", () => {
    const lines = getOrderItemLines(
      [
        { productId: "a", productName: "Snapshot A", qty: 2 },
        { productId: "b", qty: 1 },
        { productId: "papas-kaioken", qty: 3 },
      ],
      { a: "Catalogo A", b: "Catalogo B" }
    );
    expect(lines.map((l) => [l.name, l.qty])).toEqual([
      ["Snapshot A", 2],
      ["Catalogo B", 1],
      ["Papas Kaioken", 3],
    ]);
    expect(new Set(lines.map((l) => l.key)).size).toBe(3);
  });

  test("sin items devuelve lista vacía", () => {
    expect(getOrderItemLines(undefined)).toEqual([]);
  });
});

/**
 * Playwright's TSX transform emits its own JSX objects, so react-dom/server cannot render
 * them. Instead we expand function components and flatten the element tree to text + testids.
 */
type TreeNode = unknown;
function flatten(node: TreeNode): { text: string; testIds: string[]; tags: string[] } {
  const out = { text: "", testIds: [] as string[], tags: [] as string[] };
  const walk = (n: TreeNode) => {
    if (n === null || n === undefined || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") {
      out.text += String(n);
      return;
    }
    if (Array.isArray(n)) return n.forEach(walk);
    const el = n as { type?: unknown; props?: Record<string, unknown> };
    if (!el.props) return;
    if (typeof el.type === "function") return walk((el.type as (p: unknown) => TreeNode)(el.props));
    if (typeof el.type === "string") out.tags.push(el.type);
    if (typeof el.props["data-testid"] === "string") out.testIds.push(el.props["data-testid"]);
    walk(el.props.children);
  };
  walk(node);
  return out;
}

test.describe("OrderItemsSummary", () => {
  const items = [
    { productId: "p1", productName: "Burger Doble", qty: 2 },
    { productId: "p2", productName: "Papas Fritas", qty: 1 },
    { productId: "p3", productName: "Bebida 500", qty: 3 },
  ];

  test("lista incluye los tres productos con cantidades y observación", () => {
    const { text, testIds, tags } = flatten(
      OrderItemsSummary({ items, notes: "Sin cebolla", status: "preparing" })
    );
    expect(testIds).toContain("order-items-list");
    expect(tags.filter((t) => t === "li")).toHaveLength(3);
    for (const name of ["Burger Doble", "Papas Fritas", "Bebida 500"]) {
      expect(text).toContain(name);
    }
    expect(text).toContain("2×");
    expect(text).toContain("1×");
    expect(text).toContain("3×");
    expect(text).toContain("Obs: Sin cebolla");
    expect(text).toContain("Preparar");
  });

  test("usa título neutral para pedidos terminales", () => {
    const delivered = flatten(OrderItemsSummary({ items, status: "delivered" }));
    const cancelled = flatten(OrderItemsSummary({ items, status: "cancelled" }));

    expect(delivered.text).toContain("Detalle del pedido");
    expect(delivered.text).not.toContain("Preparar");
    expect(cancelled.text).toContain("Detalle del pedido");
    expect(cancelled.text).not.toContain("Preparar");
  });

  test("usa fallback de catálogo cuando falta el snapshot", () => {
    const { text } = flatten(
      OrderItemsSummary({ items: [{ productId: "p9", qty: 1 }], catalogNames: { p9: "Combo Kaioken" } })
    );
    expect(text).toContain("Combo Kaioken");
  });

  test("variante inline resume en una línea sin lista", () => {
    const { text, testIds, tags } = flatten(OrderItemsSummary({ items, variant: "inline" }));
    expect(testIds).toContain("order-items-inline");
    expect(tags).not.toContain("ul");
    expect(text).toContain("Burger Doble");
    expect(text).toContain("Bebida 500");
  });

  test("sin items ni notas no renderiza nada", () => {
    expect(OrderItemsSummary({ items: [] })).toBeNull();
  });
});
