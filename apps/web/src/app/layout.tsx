import type { Metadata } from "next";
import { Toaster } from "sonner";
import { HeoChatbot } from "@/components/ui/heo-chatbot";
import "./global.css";

export const metadata: Metadata = {
  title: "TBB AMON Delivery",
  description: "Plataforma de delivery multi-tenant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <HeoChatbot />
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
