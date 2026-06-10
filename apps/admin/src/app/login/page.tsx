"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  getIdTokenResult,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const token = await getIdTokenResult(user);
        if (token.claims.admin === true) {
          router.replace("/pedidos");
          return;
        }
      }
      setChecking(false);
    });
    return unsub;
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const token = await getIdTokenResult(credential.user, true);

      if (token.claims.admin !== true) {
        setError("Esta cuenta no tiene permisos de administrador.");
        setLoading(false);
        return;
      }

      router.replace("/pedidos");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      if (
        code === "auth/user-not-found" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        setError("Email o contraseña incorrectos.");
      } else {
        setError("Error al iniciar sesión. Intenta de nuevo.");
      }
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0B0B]">
        <p className="text-sm text-neutral-500">Verificando sesión…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(0,255,156,0.07),transparent_32%),#0B0B0B] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0D0D0D]/92 p-8 backdrop-blur-xl">
        <div className="mb-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-400/75">
            AMON Admin
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white">
            Iniciar sesión
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-widest text-neutral-500">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none transition focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/20"
              placeholder="admin@amon.cl"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-widest text-neutral-500">
              Contraseña
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none transition focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/20"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
