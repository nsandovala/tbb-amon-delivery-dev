"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, getIdTokenResult } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      const token = await getIdTokenResult(user);

      if (token.claims.admin !== true) {
        router.replace("/login");
        return;
      }

      setVerified(true);
    });

    return unsub;
  }, [router]);

  if (!verified) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-500">Verificando acceso…</p>
      </div>
    );
  }

  return <>{children}</>;
}
