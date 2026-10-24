"use client";

import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { TenantProvider, useTenantContext } from "@/components/tenant-provider";

const navItems = [
  { label: "Operacion", href: "/operacion" },
  { label: "Pedidos", href: "/pedidos" },
  { label: "POS", href: "/pos" },
  { label: "Gastos", href: "/gastos" },
  { label: "Metricas", href: "/metricas" },
  { label: "Catalogo", href: "#" },
  { label: "Clientes", href: "#" },
  { label: "Configuracion", href: "#" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  return (
    <html lang="es">
      <body className="min-h-screen bg-[#0B0B0B] text-white antialiased">
        <TenantProvider>
          <div className="min-h-screen bg-[#050505]">
            {isLogin ? (
              children
            ) : (
              <AdminChrome pathname={pathname}>{children}</AdminChrome>
            )}
          </div>
        </TenantProvider>
      </body>
    </html>
  );
}

function AdminChrome({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const router = useRouter();

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (err) {
      console.error("[admin] signOut error:", err);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-b border-[#29261f] bg-[#080808]/96 backdrop-blur-xl lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col px-5 py-6">
          <div className="mb-8">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#d6a85c]">
              AMON Delivery
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white">
              Admin IDE
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              Operacion, cocina y despacho en un solo panel.
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
                      ? "border-[#806438] bg-[#211b11] text-[#f0d296] shadow-[inset_3px_0_#d6a85c]"
                      : "border-white/6 bg-white/[0.02] text-neutral-400 hover:border-white/12 hover:bg-white/[0.04] hover:text-white",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <ActiveTenantCard />

          <button
            onClick={handleLogout}
            className="mt-2 flex w-full items-center rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-medium text-neutral-400 transition-all hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300"
          >
            Cerrar sesion
          </button>
        </div>
      </aside>

      <section className="min-w-0">{children}</section>
    </div>
  );
}

function ActiveTenantCard() {
  const { activeTenant, memberships, email, setActiveTenant } = useTenantContext();
  if (!activeTenant) {
    return (
      <div className="mt-auto rounded-2xl border border-white/8 bg-white/[0.025] p-4">
        <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
          Tenant activo
        </p>
        <p className="mt-2 text-base font-bold text-white">—</p>
      </div>
    );
  }
  const extra = memberships.filter((m) => m.tenantId !== activeTenant.tenantId);
  return (
    <div className="mt-auto rounded-2xl border border-white/8 bg-white/[0.025] p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
        Tenant activo
      </p>
      <p className="mt-2 text-base font-bold text-white">
        {activeTenant.tenantName ?? activeTenant.tenantId}
      </p>
      <p className="mt-1 text-xs uppercase tracking-widest text-emerald-400/80">
        {activeTenant.role}
      </p>
      <p className="mt-1 text-xs text-neutral-500">{email ?? ""}</p>
      {extra.length > 0 && (
        <select
          value={activeTenant.tenantId}
          onChange={(e) => setActiveTenant(e.target.value)}
          className="mt-3 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
          aria-label="Cambiar tenant activo"
        >
          {memberships.map((m) => (
            <option key={m.tenantId} value={m.tenantId}>
              {m.tenantName ?? m.tenantId}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
