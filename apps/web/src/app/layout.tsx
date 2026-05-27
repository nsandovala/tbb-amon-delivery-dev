import type { Metadata } from "next";
import { Toaster } from "sonner";
import { HeoChatbot } from "@/components/ui/heo-chatbot";
import "./global.css";

export const metadata: Metadata = {
  title: "AMON Shop",
  description: "Sistema inteligente de pedidos y operación para negocios locales.",
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
