import type { Metadata } from "next";
import { Funnel_Sans, Funnel_Display } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

// swap avoids FOIT (invisible text) on load for real users; screenshot/PDF
// captures still get the real font because they await networkidle2 +
// document.fonts.ready before snapshotting (see ScreenshotService).
const funnelSans = Funnel_Sans({
  subsets: ["latin"],
  variable: "--font-funnel-sans",
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const funnelDisplay = Funnel_Display({
  subsets: ["latin"],
  variable: "--font-funnel-display",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
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
