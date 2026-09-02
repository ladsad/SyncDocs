import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SyncDocs — Phase 0 Editor",
  description: "Collaborative, format-agnostic document editor",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
