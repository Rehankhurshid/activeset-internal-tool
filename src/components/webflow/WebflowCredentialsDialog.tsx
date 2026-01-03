'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, Settings, ExternalLink } from 'lucide-react';
import { WebflowConfig } from '@/types/webflow';

interface WebflowCredentialsDialogProps {
  currentConfig?: WebflowConfig;
  onSave: (config: WebflowConfig) => Promise<void>;
  onRemove?: () => Promise<void>;
  trigger?: React.ReactNode;
}

type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid';

export function WebflowCredentialsDialog({
  currentConfig,
  onSave,
  onRemove,
  trigger,
}: WebflowCredentialsDialogProps) {
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState(currentConfig?.siteId || '');
  const [apiToken, setApiToken] = useState(currentConfig?.apiToken || '');
  const [siteName, setSiteName] = useState(currentConfig?.siteName || '');
  const [customDomain, setCustomDomain] = useState(currentConfig?.customDomain || '');
  const [validationState, setValidationState] = useState<ValidationState>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleTestConnection = async () => {
    if (!siteId.trim() || !apiToken.trim()) {
      setValidationError('Please enter both Site ID and API Token');
      return;
    }

    setValidationState('validating');
    setValidationError(null);

    try {
      const response = await fetch('/api/webflow/validate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ siteId: siteId.trim(), apiToken: apiToken.trim() }),
      });

      const result = await response.json();

      if (result.valid) {
        setValidationState('valid');
        setSiteName(result.siteName || '');
      } else {
        setValidationState('invalid');
        setValidationError(result.error || 'Invalid credentials');
      }
    } catch {
      setValidationState('invalid');
      setValidationError('Failed to validate credentials. Please try again.');
    }
  };

  const handleSave = async () => {
    if (validationState !== 'valid') {
      setValidationError('Please test your connection before saving');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        siteId: siteId.trim(),
        apiToken: apiToken.trim(),
        siteName,
        customDomain: customDomain.trim() || undefined,
        lastSyncedAt: new Date().toISOString(),
      });
      setOpen(false);
    } catch {
      setValidationError('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;

    setSaving(true);
    try {
      await onRemove();
      setSiteId('');
      setApiToken('');
      setSiteName('');
      setCustomDomain('');
      setValidationState('idle');
      setOpen(false);
    } catch {
      setValidationError('Failed to remove configuration');
    } finally {
      setSaving(false);
    }
  };

  const resetValidation = () => {
    if (validationState !== 'idle') {
      setValidationState('idle');
      setValidationError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Configure Webflow
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Webflow Configuration</DialogTitle>
          <DialogDescription>
            Connect your Webflow site to manage pages and SEO settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="siteId">Site ID</Label>
            <Input
              id="siteId"
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                resetValidation();
              }}
              placeholder="e.g., 580e63e98c9a982ac9b8b741"
            />
            <p className="text-xs text-muted-foreground">
              Find your Site ID in Webflow: Site Settings → General → Site ID
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiToken">API Token</Label>
            <Input
              id="apiToken"
              type="password"
              value={apiToken}
              onChange={(e) => {
                setApiToken(e.target.value);
                resetValidation();
              }}
              placeholder="Enter your Webflow API token"
            />
            <p className="text-xs text-muted-foreground">
              Generate a token at{' '}
              <a
                href="https://webflow.com/dashboard/workspaces"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Webflow Workspace Settings
                <ExternalLink className="h-3 w-3" />
              </a>
              . Required scopes: <code className="text-xs">pages:read</code>,{' '}
              <code className="text-xs">pages:write</code>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customDomain">Custom Domain (Optional)</Label>
            <Input
              id="customDomain"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="e.g., muffins.webflow.io"
            />
            <p className="text-xs text-muted-foreground">
              Override the default domain for "View Page" links (e.g. use your staging URL)
            </p>
          </div>

          {validationError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          {validationState === 'valid' && siteName && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-600">
                Connected to: <strong>{siteName}</strong>
              </AlertDescription>
            </Alert>
          )}

          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={validationState === 'validating' || !siteId.trim() || !apiToken.trim()}
            className="w-full"
          >
            {validationState === 'validating' ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing Connection...
              </>
            ) : validationState === 'valid' ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                Connection Verified
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {currentConfig && onRemove && (
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={saving}
              className="sm:mr-auto"
            >
              Remove Connection
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={validationState !== 'valid' || saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Configuration'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
