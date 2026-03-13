import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DMAO",
  description: "DMAO - Built with Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
