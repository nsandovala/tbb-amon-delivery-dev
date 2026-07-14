export function getHumanOrderCode(order: {
  orderId: string;
  displayCode?: string;
  displayOrderNumber?: number;
}): string {
  if (order.displayCode) return order.displayCode;
  if (typeof order.displayOrderNumber === "number") {
    return String(order.displayOrderNumber).padStart(3, "0");
  }
  return "S/C";
}
