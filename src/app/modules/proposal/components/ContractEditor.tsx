'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DatePicker } from '@/components/ui/date-picker';
import {
    ArrowLeft,
    Save,
    Loader2,
    Lock,
    Plus,
    Trash2,
    GripVertical,
    RotateCcw,
    Sparkles,
    Building2,
    ScrollText,
} from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { Proposal, ContractData, ContractClause } from '../types/Proposal';
import {
    blankContractData,
    buildContractClauses,
    generateTermClauseBody,
    computeLockInEnd,
    formatContractDate,
    formatMoney,
    STANDARD_CLAUSE_HEADINGS,
} from '../lib/contractTemplate';

const RichTextEditor = dynamic(() => import('./RichTextEditor'), { ssr: false });

interface ContractEditorProps {
    proposal: Proposal | null;
    onSave: (proposal: Proposal) => void;
    onCancel: () => void;
    loading?: boolean;
}

const CURRENCIES = ['USD', 'SGD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'JPY', 'CHF'];

const today = () => new Date().toISOString().split('T')[0];

function ensureContract(p: Proposal | null): Proposal {
    if (p && p.data?.contract) return p;
    const base: Proposal = p
        ? { ...p, documentType: 'contract', data: { ...p.data } }
        : {
              id: '',
              documentType: 'contract',
              title: 'Retainer Agreement',
              clientName: '',
              agencyName: 'ActiveSet',
              status: 'draft',
              createdAt: today(),
              updatedAt: today(),
              data: {
                  overview: '',
                  aboutUs: '',
                  pricing: { currency: 'USD', items: [], total: '' },
                  timeline: { phases: [] },
                  terms: '',
                  signatures: {
                      agency: { name: '', email: '' },
                      client: { name: '', email: '' },
                  },
              },
          };
    base.data.contract = blankContractData();
    return base;
}

interface SortableClauseProps {
    clause: ContractClause;
    index: number;
    disabled: boolean;
    onHeading: (v: string) => void;
    onBody: (v: string) => void;
    onRemove: () => void;
}

function SortableClause({
    clause,
    index,
    disabled,
    onHeading,
    onBody,
    onRemove,
}: SortableClauseProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: clause.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="rounded-lg border border-border/60 bg-card p-3 sm:p-4"
        >
            <div className="flex items-center gap-2 mb-3">
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing shrink-0"
                    aria-label="Reorder clause"
                >
                    <GripVertical className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold text-muted-foreground w-6 shrink-0">
                    {index + 1}.
                </span>
                <Input
                    value={clause.heading}
                    disabled={disabled}
                    onChange={(e) => onHeading(e.target.value)}
                    placeholder="Clause heading"
                    className="font-semibold"
                />
                {clause.id === 'term' && clause.generated !== false && (
                    <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                        <Sparkles className="w-3 h-3" /> Auto
                    </Badge>
                )}
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    disabled={disabled}
                    onClick={onRemove}
                    aria-label="Remove clause"
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
            {clause.id === 'term' && clause.generated !== false ? (
                <div
                    className="prose prose-sm max-w-none rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: clause.body }}
                />
            ) : (
                <RichTextEditor
                    value={clause.body}
                    onChange={onBody}
                    placeholder="Clause text…"
                />
            )}
            {clause.id === 'term' && clause.generated !== false && (
                <p className="mt-2 text-xs text-muted-foreground">
                    Generated from the commercial terms above. Edit it to take manual control.
                </p>
            )}
        </div>
    );
}

export default function ContractEditor({
    proposal,
    onSave,
    onCancel,
    loading = false,
}: ContractEditorProps) {
    const [formData, setFormData] = useState<Proposal>(() => ensureContract(proposal));

    useEffect(() => {
        if (proposal) setFormData(ensureContract(proposal));
    }, [proposal]);

    const contract = formData.data.contract as ContractData;
    const isLocked = !!formData.isLocked || !!formData.data.signatures.client.signedAt;

    const patchContract = (updater: (c: ContractData) => ContractData) => {
        setFormData((prev) => {
            const prevContract = prev.data.contract as ContractData;
            let next = updater({ ...prevContract });
            // Keep the auto-managed Term clause in sync unless the user took over.
            next = {
                ...next,
                clauses: next.clauses.map((cl) =>
                    cl.id === 'term' && cl.generated !== false
                        ? { ...cl, body: generateTermClauseBody(next) }
                        : cl
                ),
            };
            return { ...prev, data: { ...prev.data, contract: next } };
        });
    };

    const setClientField = (field: keyof ContractData['client'], value: string) =>
        patchContract((c) => ({ ...c, client: { ...c.client, [field]: value } }));

    const setAgencyField = (field: keyof ContractData['agency'], value: string) =>
        patchContract((c) => ({ ...c, agency: { ...c.agency, [field]: value } }));

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleClauseDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        patchContract((c) => {
            const oldIndex = c.clauses.findIndex((cl) => cl.id === active.id);
            const newIndex = c.clauses.findIndex((cl) => cl.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return c;
            return { ...c, clauses: arrayMove(c.clauses, oldIndex, newIndex) };
        });
    };

    const updateClause = (id: string, patch: Partial<ContractClause>) =>
        patchContract((c) => ({
            ...c,
            clauses: c.clauses.map((cl) => (cl.id === id ? { ...cl, ...patch } : cl)),
        }));

    const removeClause = (id: string) =>
        patchContract((c) => ({ ...c, clauses: c.clauses.filter((cl) => cl.id !== id) }));

    const addStandardClause = (stdId: string) => {
        const fresh = buildContractClauses(contract).find((cl) => cl.id === stdId);
        if (!fresh) return;
        patchContract((c) => {
            if (c.clauses.some((cl) => cl.id === stdId)) {
                toast.info('That section is already in the contract');
                return c;
            }
            return { ...c, clauses: [...c.clauses, fresh] };
        });
    };

    const addCustomClause = () =>
        patchContract((c) => ({
            ...c,
            clauses: [
                ...c.clauses,
                {
                    id: `custom-${Date.now()}`,
                    heading: 'New Section',
                    body: '<p></p>',
                    generated: false,
                },
            ],
        }));

    const resetClauses = () => {
        if (
            !window.confirm(
                'Replace all clauses with the standard template, re-filled from the fields above? Custom edits will be lost.'
            )
        )
            return;
        patchContract((c) => ({ ...c, clauses: buildContractClauses(c) }));
        toast.success('Clauses reset to the standard template');
    };

    const handleSave = () => {
        if (isLocked) {
            toast.error('This contract is signed and locked.');
            return;
        }
        const c = formData.data.contract as ContractData;
        const clientName = c.client.legalName || c.client.signatoryName || formData.clientName;
        const updated: Proposal = {
            ...formData,
            documentType: 'contract',
            title: formData.title || `${clientName || 'Client'} — Retainer Agreement`,
            clientName,
            agencyName: c.agency.legalName || formData.agencyName,
            updatedAt: today(),
            data: {
                ...formData.data,
                signatures: {
                    agency: {
                        ...formData.data.signatures.agency,
                        name: c.agency.signatoryName || formData.data.signatures.agency.name,
                        email: c.agency.email || formData.data.signatures.agency.email,
                    },
                    client: {
                        ...formData.data.signatures.client,
                        name: c.client.signatoryName || formData.data.signatures.client.name,
                        email: c.client.email || formData.data.signatures.client.email,
                    },
                },
            },
        };
        onSave(updated);
    };

    const lockInEnd = computeLockInEnd(contract.effectiveDate, contract.lockInMonths);
    const availableStandard = STANDARD_CLAUSE_HEADINGS.filter(
        (h) => !contract.clauses.some((cl) => cl.id === h.id)
    );

    return (
        <div className="min-h-screen bg-muted/30">
            {/* Sticky header */}
            <div className="sticky top-0 z-40 bg-[#1A1A1A] text-white border-b border-[#333] px-4 sm:px-6 py-3">
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <Button
                            onClick={onCancel}
                            className="bg-[#333] hover:bg-[#444] text-white border-none h-9 px-3 shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Back</span>
                        </Button>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold truncate flex items-center gap-2">
                                <ScrollText className="w-4 h-4 shrink-0" />
                                {formData.title || 'New Contract'}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                                {contract.client.legalName || 'Retainer agreement'}
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={handleSave}
                        disabled={loading || isLocked}
                        className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 shrink-0"
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin sm:mr-2" />
                        ) : (
                            <Save className="w-4 h-4 sm:mr-2" />
                        )}
                        <span className="hidden sm:inline">
                            {isLocked ? 'Locked' : 'Save Contract'}
                        </span>
                    </Button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
                {isLocked && (
                    <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
                        <Lock className="w-5 h-5 shrink-0" />
                        <p className="text-sm">
                            This contract has been signed and is locked. Editing is disabled to
                            preserve the executed agreement.
                        </p>
                    </div>
                )}

                {/* Document */}
                <Card className="border-border/60">
                    <CardHeader>
                        <CardTitle className="text-base">Document</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="title">Agreement title</Label>
                            <Input
                                id="title"
                                value={formData.title}
                                disabled={isLocked}
                                onChange={(e) =>
                                    setFormData((p) => ({ ...p, title: e.target.value }))
                                }
                                placeholder="e.g. Web Design & Webflow Development Retainer Agreement"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Parties */}
                <Card className="border-border/60">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Building2 className="w-4 h-4" /> Parties
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-6 md:grid-cols-2">
                        {(['client', 'agency'] as const).map((side) => {
                            const party = contract[side];
                            const set =
                                side === 'client' ? setClientField : setAgencyField;
                            return (
                                <div key={side} className="space-y-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        {side === 'client' ? 'The Client (Company)' : 'The Agency (Consultant)'}
                                    </p>
                                    <div className="space-y-2">
                                        <Label>Legal / company name</Label>
                                        <Input
                                            value={party.legalName}
                                            disabled={isLocked}
                                            onChange={(e) =>
                                                set('legalName', e.target.value)
                                            }
                                            placeholder={
                                                side === 'client'
                                                    ? 'e.g. Lighthouse Canton PTE LTD'
                                                    : 'e.g. ActiveSet Technologies'
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Registered address</Label>
                                        <Textarea
                                            rows={3}
                                            value={party.address}
                                            disabled={isLocked}
                                            onChange={(e) =>
                                                set('address', e.target.value)
                                            }
                                            placeholder="Full address"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-2">
                                            <Label>Signatory name</Label>
                                            <Input
                                                value={party.signatoryName}
                                                disabled={isLocked}
                                                onChange={(e) =>
                                                    set('signatoryName', e.target.value)
                                                }
                                                placeholder="Full name"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Signatory title</Label>
                                            <Input
                                                value={party.signatoryTitle}
                                                disabled={isLocked}
                                                onChange={(e) =>
                                                    set('signatoryTitle', e.target.value)
                                                }
                                                placeholder="e.g. Director"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Email</Label>
                                        <Input
                                            type="email"
                                            value={party.email}
                                            disabled={isLocked}
                                            onChange={(e) => set('email', e.target.value)}
                                            placeholder="name@company.com"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                {/* Commercial terms */}
                <Card className="border-border/60">
                    <CardHeader>
                        <CardTitle className="text-base">Commercial terms</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Effective date</Label>
                                <DatePicker
                                    value={contract.effectiveDate}
                                    onChange={(v) =>
                                        patchContract((c) => ({ ...c, effectiveDate: v }))
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Billing cycle</Label>
                                <Select
                                    value={contract.retainer.billingCycle}
                                    onValueChange={(v) =>
                                        patchContract((c) => ({
                                            ...c,
                                            retainer: {
                                                ...c.retainer,
                                                billingCycle:
                                                    v as ContractData['retainer']['billingCycle'],
                                            },
                                        }))
                                    }
                                >
                                    <SelectTrigger disabled={isLocked}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                        <SelectItem value="quarterly">Quarterly</SelectItem>
                                        <SelectItem value="annually">Annually</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Retainer amount</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={contract.retainer.amount || ''}
                                    disabled={isLocked}
                                    onChange={(e) =>
                                        patchContract((c) => ({
                                            ...c,
                                            retainer: {
                                                ...c.retainer,
                                                amount: parseFloat(e.target.value) || 0,
                                            },
                                        }))
                                    }
                                    placeholder="1600"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Currency</Label>
                                <Select
                                    value={contract.retainer.currency}
                                    onValueChange={(v) =>
                                        patchContract((c) => ({
                                            ...c,
                                            retainer: { ...c.retainer, currency: v },
                                        }))
                                    }
                                >
                                    <SelectTrigger disabled={isLocked}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CURRENCIES.map((cur) => (
                                            <SelectItem key={cur} value={cur}>
                                                {cur}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <Separator />

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Lock-in period (months)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={contract.lockInMonths || ''}
                                    disabled={isLocked}
                                    onChange={(e) =>
                                        patchContract((c) => ({
                                            ...c,
                                            lockInMonths:
                                                Math.max(0, parseInt(e.target.value, 10) || 0),
                                        }))
                                    }
                                    placeholder="0 = no lock-in"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Governing law / jurisdiction</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        value={contract.governingLawCountry}
                                        disabled={isLocked}
                                        onChange={(e) =>
                                            patchContract((c) => ({
                                                ...c,
                                                governingLawCountry: e.target.value,
                                            }))
                                        }
                                        placeholder="Country"
                                    />
                                    <Input
                                        value={contract.jurisdictionCity}
                                        disabled={isLocked}
                                        onChange={(e) =>
                                            patchContract((c) => ({
                                                ...c,
                                                jurisdictionCity: e.target.value,
                                            }))
                                        }
                                        placeholder="City"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
                            <span className="font-medium">
                                {formatMoney(
                                    contract.retainer.amount,
                                    contract.retainer.currency
                                )}
                            </span>{' '}
                            per {contract.retainer.billingCycle.replace('ly', '')} ·{' '}
                            {contract.lockInMonths > 0 ? (
                                <>
                                    {contract.lockInMonths}-month lock-in
                                    {lockInEnd && (
                                        <> · locked until {formatContractDate(lockInEnd)}</>
                                    )}
                                </>
                            ) : (
                                <>no lock-in</>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Clauses */}
                <Card className="border-border/60">
                    <CardHeader className="flex flex-row items-center justify-between gap-2">
                        <CardTitle className="text-base">
                            Clauses ({contract.clauses.length})
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={isLocked}
                                onClick={resetClauses}
                                className="gap-1.5 text-muted-foreground"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Reset to standard</span>
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={isLocked}
                                        className="gap-1.5"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Add
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem onClick={addCustomClause}>
                                        <Plus className="w-4 h-4 mr-2" /> Blank custom section
                                    </DropdownMenuItem>
                                    {availableStandard.length > 0 && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                                                Standard sections
                                            </DropdownMenuLabel>
                                            {availableStandard.map((h) => (
                                                <DropdownMenuItem
                                                    key={h.id}
                                                    onClick={() => addStandardClause(h.id)}
                                                >
                                                    {h.heading}
                                                </DropdownMenuItem>
                                            ))}
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleClauseDragEnd}
                        >
                            <SortableContext
                                items={contract.clauses.map((c) => c.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="space-y-3">
                                    {contract.clauses.map((clause, index) => (
                                        <SortableClause
                                            key={clause.id}
                                            clause={clause}
                                            index={index}
                                            disabled={isLocked}
                                            onHeading={(v) =>
                                                updateClause(clause.id, { heading: v })
                                            }
                                            onBody={(v) =>
                                                updateClause(clause.id, {
                                                    body: v,
                                                    // user took manual control of the
                                                    // auto-generated Term clause
                                                    ...(clause.id === 'term'
                                                        ? { generated: false }
                                                        : {}),
                                                })
                                            }
                                            onRemove={() => removeClause(clause.id)}
                                        />
                                    ))}
                                    {contract.clauses.length === 0 && (
                                        <p className="text-sm text-muted-foreground text-center py-8">
                                            No clauses. Use “Add” or “Reset to standard”.
                                        </p>
                                    )}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-2 pb-12">
                    <Button variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={loading || isLocked}>
                        {loading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Contract
                    </Button>
                </div>
            </div>
        </div>
    );
}
