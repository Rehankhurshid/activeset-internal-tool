import type { ClientPortalView } from '../../domain/client-portal.types';
import { todayIso } from './portal-states';

interface PortalYourTurnProps {
  view: ClientPortalView;
  now: Date;
}

interface Item {
  href: string;
  count: number;
  label: string;
  urgent?: boolean;
}

/**
 * One line answering "is anything waiting on me?", each part a jump to the
 * section that says what. Renders nothing when nothing is.
 */
export function PortalYourTurn({ view, now }: PortalYourTurnProps) {
  const today = todayIso(now);
  const overdue = view.asks.filter((a) => a.dueDate && a.dueDate < today).length;
  const open = view.asks.length - overdue;
  // Same rule as The work's "Ready for your review" filter: any track waiting on them.
  const review = (view.work ?? []).reduce((n, w) => n + w.items.filter((i) => i.states.includes('in_review')).length, 0);
  const proposed = (view.changes ?? []).filter((c) => c.state === 'proposed').length;
  const approval = view.review && !view.review.approvedAt ? 1 : 0;
  const waitingSteps = view.stages.reduce((n, s) => n + (s.steps ?? []).filter((step) => step.waiting && step.state !== 'done').length, 0);

  const items: Item[] = [
    { href: '#portal-process-heading', count: waitingSteps, label: waitingSteps === 1 ? 'step waiting on your feedback' : 'steps waiting on your feedback' },
    { href: '#portal-asks-heading', count: overdue, label: overdue === 1 ? 'thing we needed is overdue' : 'things we needed are overdue', urgent: true },
    { href: '#portal-asks-heading', count: open, label: open === 1 ? 'thing we need from you' : 'things we need from you' },
    { href: '#portal-work-heading', count: review, label: review === 1 ? 'item ready for your review' : 'items ready for your review' },
    { href: '#portal-changes-heading', count: proposed, label: proposed === 1 ? 'change waiting for your approval' : 'changes waiting for your approval' },
    { href: '#portal-review-heading', count: approval, label: 'stage waiting for your sign-off' },
  ].filter((item) => item.count > 0);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="portal-turn-heading" className="rounded-2xl border border-amber-300/70 bg-amber-50 px-5 py-4 sm:px-7">
      <h2 id="portal-turn-heading" className="text-sm font-semibold text-amber-950">
        Your turn
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.label}>
            <a
              href={item.href}
              className={
                item.urgent
                  ? 'inline-flex items-baseline gap-1.5 rounded-full border border-rose-300 bg-white px-3 py-1 text-sm text-rose-800 hover:border-rose-400'
                  : 'inline-flex items-baseline gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-sm text-amber-950 hover:border-amber-400'
              }
            >
              <span className="font-semibold tabular-nums">{item.count}</span>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
