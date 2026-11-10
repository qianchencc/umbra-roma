import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UMBRA — 罗马光影工坊",
  description: "以一束光，重塑永恒之城。探索古罗马建筑的二分光影，亲手调整光向、空间与色彩，保存属于你的建筑版画。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
