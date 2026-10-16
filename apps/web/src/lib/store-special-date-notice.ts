import type { PublicStoreAvailability, PublicStoreDateException } from "@/lib/api/orders";

export type StoreSpecialDateNotice = {
  title: string;
  message: string;
  customerMessage?: string;
};

export function describeStoreSpecialDate(exception: PublicStoreDateException): string {
  if (exception.mode === "closed") return "Cerrado";
  if (exception.mode === "custom_hours") return `Atenderemos de ${exception.open} a ${exception.close}`;
  return "Atenderemos en nuestro horario habitual";
}

/** Prioriza el estado efectivo cuando una acción manual reemplaza la excepción configurada. */
export function getCurrentStoreSpecialDateNotice(
  availability: PublicStoreAvailability
): StoreSpecialDateNotice | null {
  if (availability.override?.mode === "open") {
    if (availability.acceptingOrders) {
      return {
        title: "Apertura excepcional",
        message: "Hoy abrimos de forma excepcional y estamos recibiendo pedidos.",
      };
    }
    if (availability.state === "closed") {
      return {
        title: "Atención de hoy",
        message: "La tienda está cerrada y no está recibiendo pedidos.",
      };
    }
  }

  if (availability.override?.mode === "closed") {
    return {
      title: "Cierre excepcional",
      message: "Hoy cerramos por decisión del local y no estamos recibiendo pedidos.",
    };
  }

  if (!availability.specialDate) return null;
  return {
    title: "Atención de hoy",
    message: describeStoreSpecialDate(availability.specialDate),
    ...(availability.specialDate.customerMessage
      ? { customerMessage: availability.specialDate.customerMessage }
      : {}),
  };
}
