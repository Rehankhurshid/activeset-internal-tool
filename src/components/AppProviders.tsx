"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { ShortcutProvider } from "@/shared/keyboard";
import { AppFrame } from "@/components/shell";

export function AppProviders({ children }: { children: React.ReactNode }) {
  // The client portal is always light: next-themes swaps the html class
  // before paint, so the shell's hard-coded `dark` never reaches /portal.
  const isPortal = usePathname()?.startsWith("/portal") ?? false;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      forcedTheme={isPortal ? "light" : undefined}
    >
      <AuthProvider>
        <ShortcutProvider>
          <AppFrame>{children}</AppFrame>
          <Toaster />
        </ShortcutProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
