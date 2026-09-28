import { cn } from '@/lib/utils';
import { parseSummary, type SummaryInline } from '../../domain/meeting-summary';

function Inline({ parts }: { parts: SummaryInline[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.type === 'strong' ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.text}
          </strong>
        ) : part.type === 'link' ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * A call summary, rendered from parsed blocks with ordinary elements. Nothing
 * in the text becomes markup: see `parseSummary`.
 */
export function PortalSummary({ markdown, className }: { markdown: string; className?: string }) {
  const blocks = parseSummary(markdown);
  if (blocks.length === 0) return null;
  return (
    <div className={cn('space-y-3 text-sm leading-relaxed text-foreground/90', className)}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <h5 key={i} className="pt-1 text-[13px] font-semibold text-foreground">
              <Inline parts={block.content} />
            </h5>
          );
        }
        if (block.type === 'paragraph') {
          return (
            <p key={i}>
              <Inline parts={block.content} />
            </p>
          );
        }
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List key={i} className="space-y-1.5">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2.5" style={{ paddingLeft: `${item.depth * 1.1}rem` }}>
                <span aria-hidden="true" className="mt-[0.6rem] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/70" />
                <span className="min-w-0">
                  <Inline parts={item.content} />
                </span>
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
