'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Code, Monitor, Smartphone } from 'lucide-react';

interface EmbedDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

export function EmbedDialog({ isOpen, onOpenChange, projectId, projectName }: EmbedDialogProps) {
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const embedCodes = {
    scriptOnly: `<!-- Auto-inject widget (simplest method) -->
<script 
    src="${baseUrl}/widget.js"
    data-auto-inject="true"
    data-project-id="${projectId}"
    data-theme="dark"
    data-show-modal="true">
</script>`,

    dropdown: `<!-- Dropdown style (matches your existing design) -->
<script 
    src="${baseUrl}/widget.js"
    data-auto-inject="true"
    data-project-id="${projectId}"
    data-style="dropdown"
    data-position="bottom-right"
    data-show-on-domains="webflow.io">
</script>`,

    javascript: `<!-- Add container and script -->
<div id="project-links-${projectId}"></div>

<script src="${baseUrl}/widget.js"></script>
<script>
  embedProjectLinksWidget("project-links-${projectId}", {
    projectId: "${projectId}",
    theme: "dark",
    showModal: true
  });
</script>`,

    dataAttributes: `<!-- Declarative approach -->
<div 
    data-project-links-widget
    data-project-id="${projectId}"
    data-theme="dark"
    data-show-modal="true">
</div>

<script src="${baseUrl}/widget.js"></script>`,

    iframe: `<!-- Direct iframe embed -->
<iframe 
    src="${baseUrl}/embed?projectId=${projectId}&theme=dark"
    width="100%" 
    height="400" 
    frameborder="0"
    style="border-radius: 8px;">
</iframe>`
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates({ ...copiedStates, [key]: true });
      setTimeout(() => {
        setCopiedStates({ ...copiedStates, [key]: false });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const CodeBlock = ({ code, copyKey, title, description }: { 
    code: string; 
    copyKey: string; 
    title: string; 
    description: string;
  }) => (
    <div className="space-y-3">
      <div>
        <h4 className="font-medium text-sm flex items-center gap-2">
          {title}
          {copyKey === 'scriptOnly' && <Badge variant="secondary" className="text-xs">Recommended</Badge>}
        </h4>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="relative">
        <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
          <code>{code}</code>
        </pre>
        <Button
          size="sm"
          variant="outline"
          className="absolute top-2 right-2 h-8 w-8 p-0"
          onClick={() => copyToClipboard(code, copyKey)}
        >
          {copiedStates[copyKey] ? (
            <Check className="h-3 w-3 text-green-600" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
                   <DialogTitle className="flex items-center gap-2">
           <Code className="h-5 w-5" />
           Embed &ldquo;{projectName}&rdquo; Widget
         </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="dropdown" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="dropdown" className="text-xs">
              <Monitor className="h-4 w-4 mr-1" />
              Dropdown
            </TabsTrigger>
            <TabsTrigger value="script-only" className="text-xs">
              <Smartphone className="h-4 w-4 mr-1" />
              Card
            </TabsTrigger>
            <TabsTrigger value="javascript" className="text-xs">
              <Code className="h-4 w-4 mr-1" />
              JavaScript
            </TabsTrigger>
            <TabsTrigger value="data-attrs" className="text-xs">
              <Monitor className="h-4 w-4 mr-1" />
              Declarative
            </TabsTrigger>
            <TabsTrigger value="iframe" className="text-xs">
              <Monitor className="h-4 w-4 mr-1" />
              iFrame
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dropdown" className="space-y-4">
            <CodeBlock
              title="Dropdown Style (Matches Your Existing Design)"
              description="Fixed position dropdown that appears on hover. Perfect replacement for your current static widget."
              code={embedCodes.dropdown}
              copyKey="dropdown"
            />
          </TabsContent>

          <TabsContent value="script-only" className="space-y-4">
            <CodeBlock
              title="Card Style Embed (No Container Required)"
              description="Clean card-style widget that injects at script location. Great for content areas."
              code={embedCodes.scriptOnly}
              copyKey="scriptOnly"
            />
          </TabsContent>

          <TabsContent value="javascript" className="space-y-4">
            <CodeBlock
              title="JavaScript API (Programmatic)"
              description="Full control over widget initialization and configuration. Best for dynamic applications."
              code={embedCodes.javascript}
              copyKey="javascript"
            />
          </TabsContent>

          <TabsContent value="data-attrs" className="space-y-4">
            <CodeBlock
              title="Data Attributes (Declarative)"
              description="Clean HTML approach with automatic initialization. Good for static sites."
              code={embedCodes.dataAttributes}
              copyKey="dataAttributes"
            />
          </TabsContent>

          <TabsContent value="iframe" className="space-y-4">
            <CodeBlock
              title="iFrame Embed (Isolated)"
              description="Completely isolated widget with its own context. Best for third-party integrations."
              code={embedCodes.iframe}
              copyKey="iframe"
            />
          </TabsContent>
        </Tabs>

                <div className="bg-muted/50 p-4 rounded-md">
          <h4 className="font-medium text-sm mb-2">💡 Configuration Options</h4>
          <div className="text-xs text-muted-foreground space-y-1">
            <div><code>data-style</code>: &ldquo;card&rdquo; or &ldquo;dropdown&rdquo;</div>
            <div><code>data-position</code>: &ldquo;bottom-right&rdquo;, &ldquo;bottom-left&rdquo;, &ldquo;top-right&rdquo;, &ldquo;top-left&rdquo; (dropdown only)</div>
            <div><code>data-show-on-domains</code>: Comma-separated domains (e.g., &ldquo;webflow.io,mysite.com&rdquo;)</div>
            <div><code>data-theme</code>: &ldquo;dark&rdquo; or &ldquo;light&rdquo; (card style only)</div>
            <div><code>data-show-modal</code>: &ldquo;true&rdquo; or &ldquo;false&rdquo; (card style only)</div>
            <div><code>data-project-id</code>: Your project ID for real-time sync</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 