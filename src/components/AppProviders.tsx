"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { ShortcutProvider } from "@/shared/keyboard";
import { AppFrame } from "@/components/shell";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
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
