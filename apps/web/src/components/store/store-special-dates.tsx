"use client";

import { useEffect, useState } from "react";
import {
  fetchPublicStoreAvailability,
  type PublicStoreAvailability,
} from "@/lib/api/orders";
import { describeStoreSpecialDate, getCurrentStoreSpecialDateNotice } from "@/lib/store-special-date-notice";

function dateLabel(date: string, timezone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: timezone,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
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
    // COST-GUARD: una pestaña en segundo plano no consulta el estado; al
    // volver a primer plano se refresca de inmediato.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tenantId]);

  if (!availability) return null;

  const today = availability.localNow.slice(0, 10);
  const currentNotice = getCurrentStoreSpecialDateNotice(availability);
  const upcoming = availability.upcomingSpecialDates
    .filter((entry) => entry.date !== today)
    .slice(0, 3);
  if (!currentNotice && upcoming.length === 0) return null;

  return (
    <aside aria-label="Fechas especiales de atención" className="mx-auto my-4 w-[calc(100%-2rem)] max-w-[1200px] border border-emerald-300/15 bg-[#101914] px-4 py-3 text-emerald-50 sm:px-5">
      {currentNotice && (
        <div className="text-sm">
          <strong className="font-semibold">{currentNotice.title}:</strong>{" "}
          <span>{currentNotice.message}</span>
          {currentNotice.customerMessage && <span> {currentNotice.customerMessage}</span>}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className={currentNotice ? "mt-2 border-t border-emerald-100/10 pt-2" : ""}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Próximas fechas especiales</p>
          <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-emerald-50/80">
            {upcoming.map((entry) => (
              <li key={entry.date}>
                <span className="capitalize">{dateLabel(entry.date, availability.timezone)}</span>: {describeStoreSpecialDate(entry)}
                {entry.customerMessage ? ` · ${entry.customerMessage}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
