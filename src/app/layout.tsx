import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SyncDocs — End-to-End Encrypted Collaborative Docs",
    template: "%s | SyncDocs",
  },
  description:
    "Real-time collaborative document editor with client-side end-to-end encryption (E2EE) and CRDT synchronization.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/favicon.svg",
  },
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
        <Analytics />
      </body>
    </html>
  );
}
