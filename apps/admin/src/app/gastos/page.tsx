"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Receipt } from "lucide-react";
import { createExpenseApi } from "../../lib/api/expenses";
import { useLiveExpenses } from "../../hooks/use-live-expenses";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_PAYMENT_METHOD_LABELS,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "../../lib/firebase/queries/expenses";
import { toDate } from "../../lib/time";

const tenantId = "tbb";

const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];
const PAYMENT_METHODS = Object.keys(
  EXPENSE_PAYMENT_METHOD_LABELS
) as ExpensePaymentMethod[];

function formatMoney(value?: number) {
  return `$${(value ?? 0).toLocaleString("es-CL")}`;
}

function getCurrentDateTimeLocalValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDate(value: unknown) {
  const date = toDate(value);
  if (!date) return "—";

  return date.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GastosPage() {
  const { expenses, loading, error } = useLiveExpenses(tenantId, 50);

  const [category, setCategory] = useState<ExpenseCategory>("supplies");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>("cash");
  const [occurredAt, setOccurredAt] = useState(() => getCurrentDateTimeLocalValue());
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
    detail?: string;
  } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const parsedAmount = Number(amount);
  const amountOk = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const descriptionOk = description.trim().length >= 2;
  const isFormValid = amountOk && descriptionOk;

  const totalExpenses = useMemo(
    () => expenses.reduce((acc, expense) => acc + (expense.amount ?? 0), 0),
    [expenses]
  );

  function resetForm() {
    setCategory("supplies");
    setDescription("");
    setAmount("");
    setPaymentMethod("cash");
    setOccurredAt(getCurrentDateTimeLocalValue());
    setNotes("");
  }

  async function handleCreateExpense() {
    if (!isFormValid || isSubmitting) return;

    try {
      setIsSubmitting(true);

      const { expenseId } = await createExpenseApi({
        tenantId,
        category,
        description: description.trim(),
        amount: parsedAmount,
        paymentMethod,
        // datetime-local yields local wall time; the backend contract needs ISO 8601.
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
      });

      resetForm();
      setToast({
        type: "success",
        message: `Gasto registrado #${expenseId.slice(0, 6).toUpperCase()}`,
        detail: "Ya aparece en el listado live.",
      });
    } catch (err) {
      console.error("Error creando gasto:", err);
      setToast({
        type: "error",
        message: "No pudimos registrar el gasto.",
        detail: err instanceof Error ? err.message : "Revisa Functions y Firestore.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B0B0B] text-white">
      <div className="mx-auto max-w-[1400px] px-4 py-5">

        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400/80">
              Control operativo
            </p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-white">Gastos</h1>
            <p className="mt-1 text-xs text-neutral-400">
              Registro de gastos operativos TBB / Foodtruck.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">
              Total listado
            </p>
            <p className="mt-0.5 text-base font-black text-emerald-400 xl:text-xl">
              {formatMoney(totalExpenses)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">

          {/* FORMULARIO */}
          <section className="rounded-2xl border border-white/10 bg-[#101010] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
                  Nuevo
                </p>
                <h2 className="mt-0.5 text-lg font-black text-white">Registrar gasto</h2>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                <Receipt className="h-4 w-4 text-emerald-300" />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div>
                <label
                  htmlFor="expense-category"
                  className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-neutral-500"
                >
                  Categoría
                </label>
                <select
                  id="expense-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/30"
                >
                  {CATEGORIES.map((value) => (
                    <option key={value} value={value} className="bg-[#101010]">
                      {EXPENSE_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="expense-description"
                  className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-neutral-500"
                >
                  Descripción
                </label>
                <input
                  id="expense-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Carne molida 5kg"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
                />
              </div>

              <div>
                <label
                  htmlFor="expense-amount"
                  className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-neutral-500"
                >
                  Monto
                </label>
                <input
                  id="expense-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="15000"
                  inputMode="numeric"
                  type="number"
                  min={1}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
                />
              </div>

              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                  Método de pago
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {PAYMENT_METHODS.map((value) => {
                    const active = paymentMethod === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPaymentMethod(value)}
                        className={[
                          "rounded-lg border px-2 py-2 text-xs font-semibold transition-all",
                          active
                            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                            : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:text-white",
                        ].join(" ")}
                      >
                        {EXPENSE_PAYMENT_METHOD_LABELS[value]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="expense-occurred-at"
                  className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-neutral-500"
                >
                  Fecha del gasto (opcional)
                </label>
                <input
                  id="expense-occurred-at"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  type="datetime-local"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/30"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-neutral-600">
                    Precargado en ahora. Puedes backdatear si hace falta.
                  </p>
                  <button
                    type="button"
                    onClick={() => setOccurredAt(getCurrentDateTimeLocalValue())}
                    className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition-all hover:bg-emerald-400/15"
                  >
                    Hoy / Ahora
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="expense-notes"
                  className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-neutral-500"
                >
                  Notas (opcional)
                </label>
                <textarea
                  id="expense-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalle, proveedor, boleta..."
                  rows={2}
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleCreateExpense()}
              disabled={!isFormValid || isSubmitting}
              className={[
                "mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black uppercase tracking-[0.1em] transition-all",
                !isFormValid || isSubmitting
                  ? "cursor-not-allowed bg-white/[0.06] text-neutral-500"
                  : "bg-emerald-400 text-black shadow-[0_0_18px_rgba(0,255,156,0.22)] hover:bg-emerald-300",
              ].join(" ")}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                `Registrar gasto${amountOk ? ` · ${formatMoney(parsedAmount)}` : ""}`
              )}
            </button>
          </section>

          {/* LISTADO */}
          <section className="rounded-2xl border border-white/10 bg-[#101010] p-4">
            <div className="mb-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
                Historial
              </p>
              <h2 className="mt-0.5 text-lg font-black text-white">Últimos gastos</h2>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                No pudimos leer los gastos. Verifica que tu sesión tenga claim admin.
              </div>
            ) : loading ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] px-6 py-8 text-center text-sm text-neutral-500">
                Cargando gastos...
              </div>
            ) : expenses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-center text-sm text-neutral-500">
                Aún no hay gastos registrados.
              </div>
            ) : (
              <div className="space-y-1.5">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#0D0D0D] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {expense.description ?? "Sin descripción"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-neutral-500">
                        {expense.category
                          ? EXPENSE_CATEGORY_LABELS[expense.category]
                          : "Sin categoría"}
                        {" · "}
                        {expense.paymentMethod
                          ? EXPENSE_PAYMENT_METHOD_LABELS[expense.paymentMethod]
                          : "—"}
                        {" · "}
                        {formatDate(expense.occurredAt)}
                      </p>
                      {expense.notes ? (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-600">
                          {expense.notes}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm font-bold text-emerald-400">
                      {formatMoney(expense.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {toast ? (
        <div className="pointer-events-none fixed right-6 top-6 z-[100]">
          <div
            className={[
              "min-w-[280px] rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-sm",
              toast.type === "success"
                ? "border-emerald-400/20 bg-[#07150f]/95 text-emerald-200"
                : "border-red-400/20 bg-[#1a0b0b]/95 text-red-200",
            ].join(" ")}
          >
            <p className="text-sm font-semibold">
              {toast.type === "success" ? "Gasto registrado" : "Error operativo"}
            </p>
            <p className="mt-1 text-sm opacity-90">{toast.message}</p>
            {toast.detail ? (
              <p className="mt-1 text-xs opacity-75">{toast.detail}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
