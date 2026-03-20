export type HeoContext =
  | "new_customer"
  | "returning_customer"
  | "order_in_progress"
  | "reward_near"
  | "idle_browsing";

export interface HeoAction {
  label: string;
  action: "repeat_order" | "track_order" | "show_recommendation" | "add_fries";
}

export interface HeoResponse {
  title: string;
  message: string;
  actions: HeoAction[];
}

export const HEO_RESPONSES: Record<HeoContext, HeoResponse> = {
  new_customer: {
    title: "Hola 👋",
    message: "Primera vez por aquí. Te muestro lo más pedido.",
    actions: [
      { label: "🍔 Ver recomendación HEO", action: "show_recommendation" },
    ],
  },
  returning_customer: {
    title: "Volviste.",
    message: "Tu burger favorita está a un click.",
    actions: [
      { label: "🔁 Repetir pedido", action: "repeat_order" },
    ],
  },
  order_in_progress: {
    title: "Tu pedido sigue avanzando.",
    message: "Ya está en proceso. Te muestro el estado actual.",
    actions: [
      { label: "⏱ Ver estado", action: "track_order" },
    ],
  },
  reward_near: {
    title: "Vas desbloqueando algo bueno.",
    message: "Te faltan pocas Burger Koins para una recompensa.",
    actions: [
      { label: "🍟 Agregar papas", action: "add_fries" },
    ],
  },
  idle_browsing: {
    title: "HEO Copilot",
    message: "¿Qué hacemos hoy?",
    actions: [
      { label: "🔁 Repetir pedido", action: "repeat_order" },
      { label: "⏱ Ver tiempo de espera", action: "track_order" },
      { label: "🍔 Recomendación HEO", action: "show_recommendation" },
    ],
  },
};