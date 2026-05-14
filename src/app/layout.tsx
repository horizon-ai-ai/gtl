import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Marketing AI Platform",
  description: "對話即行銷 — 跟 AI 聊天，完成所有行銷工作",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
