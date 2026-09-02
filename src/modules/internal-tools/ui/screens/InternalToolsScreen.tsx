'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Chrome,
  CircleCheck,
  Download,
  FolderCode,
  LayoutGrid,
  Link2,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AppNavigation } from '@/shared/ui';
import { useModuleAccess } from '@/modules/auth-access';
import { visibleTools, type Tool } from '../../data/tools';
import { useExtensionPairing, type PairingState } from '../hooks/useExtensionPairing';

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2 text-sm text-muted-foreground">
      {steps.map((step, i) => (
        <li key={step} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
            {i + 1}
          </span>
          <span className="leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Live install + pairing state for one extension. Kept in its own component so
 * the hook only runs for tools that actually declare a pinned extension id.
 */
function PairingStrip({ tool }: { tool: Tool }) {
  const { state, version, error, busy, pair, unpair, recheck } = useExtensionPairing(
    tool.pairingSlug!,
    tool.extensionId!,
    true
  );

  const label: Record<PairingState, string> = {
    checking: 'Checking whether it is installed…',
    'not-installed': 'Not installed in this browser',
    installed: version ? `Installed (v${version})` : 'Installed',
    paired: 'Paired with this browser',
    error: 'Pairing failed',
  };

  const tone =
    state === 'paired'
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : state === 'installed'
        ? 'border-sky-500/30 bg-sky-500/10'
        : 'border-border bg-muted/40';

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${tone}`}>
      <span className="flex items-center gap-2 text-xs font-medium">
        {state === 'paired' ? (
          <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        {label[state]}
        {version && state !== 'not-installed' && tool.version && version !== tool.version && (
          <span className="text-amber-600 dark:text-amber-500">
            · v{tool.version} available
          </span>
        )}
      </span>

      <span className="ml-auto flex items-center gap-2">
        {state === 'not-installed' && (
          <Button size="sm" variant="outline" onClick={recheck}>
            Re-check
          </Button>
        )}
        {(state === 'installed' || state === 'error') && (
          <Button size="sm" onClick={pair} disabled={busy}>
            {busy ? 'Pairing…' : 'Pair with this browser'}
          </Button>
        )}
        {state === 'paired' && (
          <Button size="sm" variant="outline" onClick={unpair} disabled={busy}>
            {busy ? 'Unpairing…' : 'Unpair'}
          </Button>
        )}
      </span>

      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const isExtension = tool.kind === 'extension';

  return (
    <Card className="h-full">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={
                isExtension
                  ? 'flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 dark:bg-violet-500/20'
                  : 'flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 dark:bg-sky-500/20'
              }
            >
              {isExtension ? (
                <Chrome className="h-5 w-5 text-violet-500" />
              ) : (
                <LayoutGrid className="h-5 w-5 text-sky-500" />
              )}
            </span>
            <div>
              <CardTitle className="text-base">{tool.name}</CardTitle>
              {tool.version && (
                <span className="text-xs text-muted-foreground">v{tool.version}</span>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {isExtension ? 'Chrome extension' : 'In-app'}
          </Badge>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{tool.summary}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {tool.warning && (
          <div className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
            <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              {tool.warning}
            </p>
          </div>
        )}

        {tool.extensionId && tool.pairingSlug && <PairingStrip tool={tool} />}

        <div className="flex flex-wrap items-center gap-2">
          {tool.href && (
            <Button asChild size="sm">
              <Link href={tool.href}>
                Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
          {tool.download && (
            <Button asChild size="sm">
              {/* A plain link, not fetch+blob: the browser saves it and the file
                  is served straight from public/. */}
              <a href={tool.download} download>
                <Download className="mr-1 h-3.5 w-3.5" /> Download
              </a>
            </Button>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <FolderCode className="h-3.5 w-3.5" />
            <code className="font-mono">{tool.source}</code>
          </span>
        </div>

        <Separator />

        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Setup
          </h4>
          <Steps steps={tool.steps} />
        </div>

        {tool.notes && tool.notes.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Worth knowing
            </h4>
            <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              {tool.notes.map((note) => (
                <li key={note} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  description,
  tools,
}: {
  title: string;
  description: string;
  tools: Tool[];
}) {
  if (!tools.length) return null;
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </section>
  );
}

export function InternalToolsScreen() {
  const { hasAccess: hasInvoices, loading: invoicesLoading } = useModuleAccess('invoices');

  // Until the grant resolves, show nothing gated rather than flashing a card
  // that is about to disappear.
  const grants = { invoices: invoicesLoading ? false : hasInvoices };
  const modules = visibleTools('module', grants);
  const extensions = visibleTools('extension', grants);

  return (
    <div className="min-h-screen bg-background">
      <AppNavigation title="Internal Tools" showBackButton backHref="/" />

      <main className="container mx-auto max-w-5xl space-y-10 px-4 py-8">
        {/* AppNavigation already renders the page title as the h1, the same way
            ScreenshotRunnerScreen relies on it. Repeating it here would give the
            page two h1s. */}
        <header>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Everything the team has built for itself, with the setup steps in one place.
            Extensions install unpacked — they are not on the Chrome Web Store, so they do
            not auto-update. Download again when a version number here changes.
          </p>
        </header>

        <Section
          title="In the app"
          description="Open and use straight away — nothing to install."
          tools={modules}
        />

        <Section
          title="Chrome extensions"
          description="Download, then load unpacked from chrome://extensions."
          tools={extensions}
        />
      </main>
    </div>
  );
}
