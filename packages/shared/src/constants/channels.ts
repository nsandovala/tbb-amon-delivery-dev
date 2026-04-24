
export const ORDER_CHANNELS = [
    "web",
    "whatsapp",
    "admin_pos",
    "marketplace",
  ] as const;
  
  export type OrderChannel = (typeof ORDER_CHANNELS)[number];