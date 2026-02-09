import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Heading + body fonts give the dashboard a distinctive voice.
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"]
});

const text = Manrope({
  subsets: ["latin"],
  variable: "--font-text",
  weight: ["300", "400", "500", "600"]
});

export const metadata: Metadata = {
  title: "Open Social Metric Dashboard",
  description: "Open-source, offline-first social metrics dashboard."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`}>
      <body>{children}</body>
    </html>
  );
}
