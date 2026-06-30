import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Email Thread Scraper",
  description: "Nylas-backed email thread scraper",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
