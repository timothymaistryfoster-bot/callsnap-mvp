import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CallSnap — Client call summaries in seconds",
  description:
    "Upload a client call recording and get an executive summary, action items, key decisions, and a polished client recap instantly.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
