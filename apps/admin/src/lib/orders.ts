type OrderIdentity = {
  id: string;
  displayCode?: string;
  displayOrderNumber?: number;
};

type OrderWithCustomer = OrderIdentity & {
  customer?: {
    name?: string;
  };
};

export function getHumanOrderCode(order: OrderIdentity): string {
  if (order.displayCode) return order.displayCode;
  if (typeof order.displayOrderNumber === "number") {
    return String(order.displayOrderNumber).padStart(3, "0");
  }
  return "S/C";
}

export function getHumanOrderLabel(order: OrderIdentity): string {
  const code = getHumanOrderCode(order);
  return code === "S/C" ? "Pedido sin correlativo" : `Pedido #${code}`;
}

export function getOrderOperatorTitle(
  order: OrderWithCustomer
): string {
  const customerName = order.customer?.name?.trim();
  return customerName
    ? `${getHumanOrderLabel(order)} · ${customerName}`
    : getHumanOrderLabel(order);
}

type OrderItemLike = {
  productId?: string;
  productName?: string;
  qty?: number;
};

export type OrderItemLine = {
  key: string;
  name: string;
  qty: number;
};

export function prettifyProductId(productId?: string): string {
  if (!productId) return "Producto";
  return productId
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Name precedence: the snapshot persisted on the order line (what was actually sold),
 * then the live catalog, then a prettified productId. Never invents data.
 */
export function getOrderItemLines(
  items: OrderItemLike[] | undefined,
  catalogNames: Record<string, string> = {}
): OrderItemLine[] {
  return (items ?? []).map((item, index) => ({
    key: `${item.productId ?? "item"}-${index}`,
    name:
      item.productName?.trim() ||
      (item.productId ? catalogNames[item.productId] : undefined) ||
      prettifyProductId(item.productId),
    qty: item.qty ?? 0,
  }));
}
