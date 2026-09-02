'use client';

import { CircleNotch, GoogleLogo } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/modules/auth-access';
import { Kbd } from '@/shared/keyboard';

export function LoginForm() {
  const { signInWithGoogle, loading, error } = useAuth();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div className="sh-glow pointer-events-none absolute inset-x-0 top-0 h-[60vh]" aria-hidden />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.55_0.22_310)] text-xl font-bold text-primary-foreground shadow-xl shadow-primary/30">
            A
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Activeset Tools</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Projects, audits, proposals and the team&apos;s tools. Built for the keyboard.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={signInWithGoogle}
          disabled={loading}
          size="lg"
          className="h-11 w-full gap-2.5 text-[15px] shadow-lg shadow-primary/25"
        >
          {loading ? <CircleNotch className="size-5 animate-spin" /> : <GoogleLogo className="size-5" weight="bold" />}
          Continue with Google
        </Button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Only <span className="font-medium text-foreground/80">@activeset.co</span> accounts can sign in.
        </p>

        <div className="mt-10 flex items-center justify-center gap-2 text-[11px] text-muted-foreground/70">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          <span>for anything, once you&apos;re in</span>
        </div>
      </div>
    </div>
  );
}
