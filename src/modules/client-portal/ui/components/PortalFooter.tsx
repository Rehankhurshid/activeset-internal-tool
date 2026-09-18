import { ActiveSetWordmark } from './ActiveSetWordmark';

interface PortalFooterProps {
  brandName: string;
  agencyContactEmail?: string;
}

export function PortalFooter({ brandName, agencyContactEmail }: PortalFooterProps) {
  return (
    <footer className="border-t border-border pt-8 sm:pt-10">
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        This page is private to {brandName}. Please don&apos;t forward the link. If it stops working, ask your
        ActiveSet contact for a new one.
      </p>
      {agencyContactEmail && (
        <p className="mt-3 text-sm text-muted-foreground">
          Questions?{' '}
          <a
            href={`mailto:${agencyContactEmail}`}
            className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            {agencyContactEmail}
          </a>
        </p>
      )}
      <ActiveSetWordmark className="mt-8" />
    </footer>
  );
}
