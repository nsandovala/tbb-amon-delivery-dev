import type { ReactNode } from "react";
import { AdminGuard } from "@/components/admin-guard";

export default function PosLayout({ children }: { children: ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
