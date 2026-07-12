"use client";

import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

const navItems = [
  { label: "Pedidos", href: "/pedidos" },
  { label: "POS", href: "/pos" },
  { label: "Gastos", href: "/gastos" },
  { label: "Catálogo", href: "#" },
  { label: "Clientes", href: "#" },
  { label: "Métricas", href: "#" },
  { label: "Configuración", href: "#" },
];

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (err) {
      console.error("[admin] signOut error:", err);
    }
  }

  return (
    <html lang="es">
      <body className="min-h-screen bg-[#0B0B0B] text-white antialiased">
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(0,255,156,0.07),transparent_32%),#0B0B0B]">
          {isLogin ? (
            children
          ) : (
          <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="border-b border-white/6 bg-[#0D0D0D]/92 backdrop-blur-xl lg:border-b-0 lg:border-r">
              <div className="flex h-full flex-col px-5 py-6">
                <div className="mb-8">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-400/75">
                    AMON Delivery
                  </p>
                  <h1 className="mt-2 text-2xl font-black tracking-tight text-white">
                    Admin IDE
                  </h1>
                  <p className="mt-2 text-sm text-neutral-500">
                    Operación, cocina y despacho en un solo panel.
                  </p>
                </div>

                <nav className="space-y-2">
                  {navItems.map((item) => {
                    const isActive =
                      item.href !== "#" &&
                      (pathname === item.href || pathname.startsWith(`${item.href}/`));

                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className={[
                          "flex items-center rounded-2xl border px-4 py-3 text-sm font-medium transition-all",
                          isActive
                            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300 shadow-[0_0_0_1px_rgba(0,255,156,0.05),0_0_18px_rgba(0,255,156,0.08)]"
                            : "border-white/6 bg-white/[0.02] text-neutral-400 hover:border-white/12 hover:bg-white/[0.04] hover:text-white",
                        ].join(" ")}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>

                <div className="mt-auto rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
                    Tenant activo
                  </p>
                  <p className="mt-2 text-base font-bold text-white">TBB</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    The Best Burger – Receta de la Abuela
                  </p>
                </div>

                <button
                  onClick={handleLogout}
                  className="mt-2 flex w-full items-center rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-medium text-neutral-400 transition-all hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300"
                >
                  Cerrar sesión
                </button>
              </div>
            </aside>

            <section className="min-w-0">{children}</section>
          </div>
          )}
        </div>
      </body>
    </html>
  );
}