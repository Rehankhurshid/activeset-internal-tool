'use client';

import { useState } from 'react';
import { Coins, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { projectsService } from '@/services/database';
import { BILLING_TYPE_LABELS, normalizeBillingType, type BillingType } from '@/types';
import { formatMoney } from '@/lib/format-money';

interface ProjectBillingButtonProps {
  projectId: string;
  billingType?: BillingType;
  hourlyRate?: number;
  billingCurrency?: string;
  billingContactEmail?: string;
  billingCountry?: string;
}

const BILLING_TYPES: BillingType[] = ['fixed', 'retainer', 'adhoc'];

/**
 * Compact popover in the project header for setting how a project is billed.
 * For `adhoc` projects it also captures the default hourly rate, currency, and
 * the email the Refrens invoice is billed to — the inputs the task → invoice
 * flow needs. Admin-only (rendered conditionally by the parent).
 */
export function ProjectBillingButton({
  projectId,
  billingType,
  hourlyRate,
  billingCurrency,
  billingContactEmail,
  billingCountry,
}: ProjectBillingButtonProps) {
  const current = normalizeBillingType(billingType);

  const [open, setOpen] = useState(false);
  const [draftType, setDraftType] = useState<BillingType>(current);
  const [rate, setRate] = useState(hourlyRate != null ? String(hourlyRate) : '');
  const [currency, setCurrency] = useState((billingCurrency ?? 'USD').toUpperCase());
  const [email, setEmail] = useState(billingContactEmail ?? '');
  const [country, setCountry] = useState(billingCountry ?? '');
  const [saving, setSaving] = useState(false);

  // Sync the draft from the latest props whenever the popover opens — the
  // project subscription may have changed the stored values since last open.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraftType(current);
      setRate(hourlyRate != null ? String(hourlyRate) : '');
      setCurrency((billingCurrency ?? 'USD').toUpperCase());
      setEmail(billingContactEmail ?? '');
      setCountry(billingCountry ?? '');
    }
    setOpen(next);
  };

  const summary =
    current === 'adhoc'
      ? hourlyRate != null
        ? `Ad-hoc · ${formatMoney(hourlyRate, billingCurrency)}/h`
        : 'Ad-hoc / hourly'
      : BILLING_TYPE_LABELS[current];

  const handleSave = async () => {
    const parsedRate = rate.trim() ? Number(rate) : null;
    // Rate is optional for ad-hoc (tasks can be fixed-price), but if one is
    // entered it must be a positive number.
    if (draftType === 'adhoc' && parsedRate != null) {
      if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
        toast.error('Hourly rate must be a positive number');
        return;
      }
    }
    setSaving(true);
    try {
      await projectsService.updateProjectBilling(projectId, {
        billingType: draftType,
        hourlyRate: draftType === 'adhoc' ? parsedRate : null,
        billingCurrency: draftType === 'adhoc' ? currency : null,
        billingContactEmail: draftType === 'adhoc' ? email : null,
        billingCountry: draftType === 'adhoc' ? country : null,
      });
      toast.success('Billing updated');
      setOpen(false);
    } catch (err) {
      console.error('[ProjectBillingButton] save failed', err);
      toast.error('Failed to update billing');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          title="Billing settings"
        >
          <Coins className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
          {summary}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Billing type</Label>
          <Select value={draftType} onValueChange={(v) => setDraftType(v as BillingType)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {BILLING_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {draftType === 'adhoc' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Hourly rate</Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="optional"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder="USD"
                  maxLength={3}
                  className="h-9 uppercase"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bill-to email (optional)</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="accounts@client.com"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bill-to country</Label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="France"
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Refrens requires a country on every invoice. The bill-to name uses the
                project&apos;s client name.
              </p>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
