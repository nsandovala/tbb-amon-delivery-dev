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
