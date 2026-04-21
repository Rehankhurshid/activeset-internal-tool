import type { Metadata } from "next";
import { Funnel_Sans, Funnel_Display } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

const funnelSans = Funnel_Sans({
  subsets: ["latin"],
  variable: "--font-funnel-sans",
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "block", // block = no fallback flash; PDF captures real font
});

const funnelDisplay = Funnel_Display({
  subsets: ["latin"],
  variable: "--font-funnel-display",
  weight: ["400", "500", "600", "700", "800"],
  display: "block",
});

export const metadata: Metadata = {
  title: "Activeset Tools",
  description: "Manage your project links with real-time collaboration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className={`${funnelSans.variable} ${funnelDisplay.variable} font-sans antialiased bg-background text-foreground`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
