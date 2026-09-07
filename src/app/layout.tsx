import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

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
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-canvas text-ink font-sans antialiased selection:bg-sage-soft selection:text-ink">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

