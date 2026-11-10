import type { Product } from "@/types";

// Textos autorizados para TBB, presentados sin escribir en Firestore.
const descriptions: Record<string, string> = {
  "vader-burger": "Burger con salteado de verduras, carne con la receta exclusiva de la abuela, salsa verde y condimentos oscuros.",
  "burger-cheddar": "Burger con queso cheddar artesanal, lechuga y salsa verde.",
  "imperial-burger": "Triple burger con queso cheddar artesanal, tomate limachino, lechuga litoral y salsa verde.",
  "shenlong-burger": "Doble burger con doble queso cheddar artesanal, cebolla morada con un toque de pimienta, salsa verde y lechuga.",
  "chacarero-prime": "Mechada con mayo casera con ajo, porotos verdes del Maipo, tomate limachino, ajo verde con aceite de oliva y pimienta negra.",
  "mechada-italiana-3000": "Mechada con palta Hass, mayonesa casera, tomate limachino y un toque de condimento japonés.",
  "mechada-chedaron": "Mechada con queso cheddar artesanal, lechuga y salsa verde.",
  "super-mechada": "Posta paleta cocinada a fuego lento con salsa verde de huevo, ajo, aceite maravilla y cilantro fresco.",
};

export function getDisplayDescription(product: Product): string {
  return product.tenantId === "tbb"
    ? descriptions[product.id] ?? product.description
    : product.description;
}