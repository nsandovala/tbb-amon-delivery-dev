"use client";

import { useEffect, useState } from "react";
import {
  fetchPublicStoreAvailability,
  type PublicStoreAvailability,
  type PublicStoreDateException,
} from "@/lib/api/orders";

function dateLabel(date: string, timezone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: timezone,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function description(exception: PublicStoreDateException): string {
  if (exception.mode === "closed") return "Cerrado";
  if (exception.mode === "custom_hours") return `Atenderemos de ${exception.open} a ${exception.close}`;
  return "Atenderemos en nuestro horario habitual";
}

export function StoreSpecialDates({ tenantId }: { tenantId: string }) {
  const [availability, setAvailability] = useState<PublicStoreAvailability | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      void fetchPublicStoreAvailability(tenantId)
        .then((data) => { if (active) setAvailability(data); })
        .catch(() => { /* La disponibilidad de fechas es informativa; checkout valida el estado real. */ });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [tenantId]);

  if (!availability) return null;

  const today = availability.localNow.slice(0, 10);
  const currentException = availability.specialDate;
  const upcoming = availability.upcomingSpecialDates
    .filter((entry) => entry.date !== today)
    .slice(0, 3);
  if (!currentException && upcoming.length === 0) return null;

  return (
    <aside aria-label="Fechas especiales de atención" className="mx-auto my-4 w-[calc(100%-2rem)] max-w-[1200px] border border-emerald-300/15 bg-[#101914] px-4 py-3 text-emerald-50 sm:px-5">
      {currentException && (
        <div className="text-sm">
          <strong className="font-semibold">Atención de hoy:</strong>{" "}
          <span>{description(currentException)}.</span>
          {currentException.customerMessage && <span> {currentException.customerMessage}</span>}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className={currentException ? "mt-2 border-t border-emerald-100/10 pt-2" : ""}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Próximas fechas especiales</p>
          <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-emerald-50/80">
            {upcoming.map((entry) => (
              <li key={entry.date}>
                <span className="capitalize">{dateLabel(entry.date, availability.timezone)}</span>: {description(entry)}
                {entry.customerMessage ? ` · ${entry.customerMessage}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
