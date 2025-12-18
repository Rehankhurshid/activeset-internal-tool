'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Code } from 'lucide-react';

interface EmbedDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

export function EmbedDialog({ isOpen, onOpenChange, projectId, projectName }: EmbedDialogProps) {
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

  const baseUrl = 'https://app.activeset.co';

  const embedCode = `<!-- Link Injector Widget -->
<script 
    src="${baseUrl}/widget.js"
    data-auto-inject="true"
    data-project-id="${projectId}">
</script>`;

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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Embed &ldquo;{projectName}&rdquo; Widget
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-md">
            <p className="text-sm text-foreground font-medium mb-2">Instructions</p>
            <p className="text-sm text-muted-foreground">
              Copy the code below and paste it into the <code>&lt;head&gt;</code> or <code>&lt;body&gt;</code> of your website.
            </p>
            <div className="mt-2 text-xs text-amber-500 flex items-center gap-2">
              <span>⚠️ This widget will <strong>only</strong> appear on <code>*.webflow.io</code> domains.</span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute top-0 right-0 p-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => copyToClipboard(embedCode, 'universal')}
              >
                {copiedStates['universal'] ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
            <pre className="bg-slate-950 text-slate-50 p-4 rounded-md text-sm overflow-x-auto border border-slate-800">
              <code>{embedCode}</code>
            </pre>
          </div>

          <div className="text-xs text-muted-foreground flex justify-between settings-hint">
            <span>Default Position: Bottom Right</span>
            <span>Style: Dropdown</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}