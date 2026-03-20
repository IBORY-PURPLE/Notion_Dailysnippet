import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notion To Daily Snippet",
  description: "Sync today's Notion daily_snippet page to external API"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
