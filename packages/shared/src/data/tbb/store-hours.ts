import type { StoreHoursConfig } from "../../types/store-operation.js";

const DEFAULT_DAY = { enabled: true, open: "17:30", close: "22:30" };

/**
 * Horario inicial de TBB (M6J). Bootstrap únicamente: el seed lo crea solo si
 * `settings/storeHours` no existe, y desde ahí se edita en Admin → Operación.
 */
export const TBB_STORE_HOURS: StoreHoursConfig = {
  timezone: "America/Santiago",
  closingWarningMinutes: 15,
  days: {
    sunday: { ...DEFAULT_DAY },
    monday: { ...DEFAULT_DAY },
    tuesday: { ...DEFAULT_DAY },
    wednesday: { ...DEFAULT_DAY },
    thursday: { ...DEFAULT_DAY },
    friday: { ...DEFAULT_DAY },
    saturday: { ...DEFAULT_DAY },
  },
};
