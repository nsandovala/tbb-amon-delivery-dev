import type { ReactNode } from "react";
import { AdminGuard } from "@/components/admin-guard";

export default function MetricasLayout({ children }: { children: ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
