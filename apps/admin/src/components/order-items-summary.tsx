import { getOrderItemLines, type OrderItemLine } from "../lib/orders";

type OrderItemsSummaryProps = {
  items?: { productId?: string; productName?: string; qty?: number }[];
  catalogNames?: Record<string, string>;
  notes?: string;
  /** "list": one line per product (kitchen card). "inline": single wrapped line (POS open sales). */
  variant?: "list" | "inline";
};

function Line({ line }: { line: OrderItemLine }) {
  return (
    <>
      <span className="font-black tabular-nums text-emerald-300">{line.qty}×</span>{" "}
      <span className="font-semibold text-white">{line.name}</span>
    </>
  );
}

export function OrderItemsSummary({
  items,
  catalogNames,
  notes,
  variant = "list",
}: OrderItemsSummaryProps) {
  const lines = getOrderItemLines(items, catalogNames);
  const trimmedNotes = notes?.trim();

  if (lines.length === 0 && !trimmedNotes) return null;

  if (variant === "inline") {
    return (
      <p className="text-[11px] leading-snug text-neutral-300" data-testid="order-items-inline">
        {lines.map((line, index) => (
          <span key={line.key}>
            {index > 0 ? <span className="text-neutral-600"> · </span> : null}
            <Line line={line} />
          </span>
        ))}
      </p>
    );
  }

  return (
    <div
      className="rounded-xl border border-white/8 bg-black/20 p-3"
      data-testid="order-items-list"
    >
      <p className="mb-1.5 text-xs uppercase tracking-[0.16em] text-neutral-500">Preparar</p>
      {lines.length > 0 ? (
        <ul className="space-y-1">
          {lines.map((line) => (
            <li key={line.key} className="text-sm leading-snug sm:text-base">
              <Line line={line} />
            </li>
          ))}
        </ul>
      ) : null}
      {trimmedNotes ? (
        <p className="mt-2 border-t border-white/6 pt-2 text-xs text-amber-200/90">
          Obs: {trimmedNotes}
        </p>
      ) : null}
    </div>
  );
}
