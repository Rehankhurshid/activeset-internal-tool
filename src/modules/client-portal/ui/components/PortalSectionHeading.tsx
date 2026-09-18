import { cn } from '@/lib/utils';

interface PortalSectionHeadingProps {
  id?: string;
  children: React.ReactNode;
  /** `eyebrow` is the small caps label inside a card; `title` heads a page section. */
  variant?: 'eyebrow' | 'title';
  className?: string;
}

export function PortalSectionHeading({ id, children, variant = 'title', className }: PortalSectionHeadingProps) {
  return (
    <h2
      id={id}
      className={cn(
        variant === 'eyebrow'
          ? 'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'
          : 'text-lg font-semibold tracking-tight text-foreground',
        className,
      )}
    >
      {children}
    </h2>
  );
}
