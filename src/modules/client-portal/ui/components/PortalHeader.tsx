import { brandInitial } from './portal-format';

interface PortalHeaderProps {
  brandName: string;
  brandLogoUrl?: string;
  projectName: string;
  welcome?: string;
}

export function PortalHeader({ brandName, brandLogoUrl, projectName, welcome }: PortalHeaderProps) {
  return (
    <header className="space-y-5">
      <div className="flex items-center gap-3">
        {brandLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brandLogoUrl}
            alt={brandName}
            className="h-10 w-10 rounded-xl border border-border bg-card object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-sm font-semibold text-background"
          >
            {brandInitial(brandName)}
          </span>
        )}
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{brandName}</span>
      </div>
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">{projectName}</h1>
        {welcome && <p className="max-w-prose text-base leading-relaxed text-muted-foreground sm:text-lg">{welcome}</p>}
      </div>
    </header>
  );
}
