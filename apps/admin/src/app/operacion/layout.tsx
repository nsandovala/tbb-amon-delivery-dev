import type { ReactNode } from "react";
import { AdminGuard } from "@/components/admin-guard";

export default function OperacionLayout({ children }: { children: ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
