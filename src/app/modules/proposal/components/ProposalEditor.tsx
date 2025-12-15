'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Plus, Trash2, Save, Loader2, Settings, X, ImageIcon, Upload, FileText, AlertTriangle, Sparkles, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Proposal, ProposalTemplate } from "../types/Proposal";
import LivePreview from "./LivePreview";
import RichTextEditor from "./RichTextEditor";
import { DatePicker } from "@/components/ui/date-picker";

// Constants removed - using dynamic configurations from useConfigurations hook
const DEFAULT_HERO = '/default-hero.png';

interface ProposalEditorProps {
  proposal: Proposal | null;
  editingTemplate?: ProposalTemplate | null;
  onSave: (proposal: Proposal) => void;
  onSaveAsTemplate: (name: string, data: Proposal['data']) => void;
  onDeleteTemplate?: () => void;
  onCancel: () => void;
  loading?: boolean;
}

interface AboutTemplate {
  id: string;
  label: string;
  text: string;
}

interface TermsTemplate {
  id: string;
  label: string;
  text: string;
}

import { useConfigurations, AgencyProfile } from "@/hooks/useConfigurations";

interface SortableServiceItemProps {
  id: string;
  service: string;
  onRemove: () => void;
}

function SortableServiceItem({ id, service, onRemove }: SortableServiceItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-start group relative">
      <div
        {...attributes}
        {...listeners}
        className="mt-2 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-1 bg-muted/30 p-2 rounded-md text-sm border border-border/50">
        • {service}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function ProposalEditor({ proposal, editingTemplate, onSave, onSaveAsTemplate, onDeleteTemplate, onCancel, loading = false }: ProposalEditorProps) {
  // Load dynamic configurations
  const configs = useConfigurations();

  // Template editing mode
  const isEditingTemplate = !!editingTemplate;

  // Template Dialog State
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState(editingTemplate?.name || '');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // AI Fill State
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState('');
  const [clientWebsite, setClientWebsite] = useState('');
  const [projectDeadline, setProjectDeadline] = useState('');
  const [projectBudget, setProjectBudget] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Preset States - Initialize with empty, populate from configs when loaded
  const [titlePresets, setTitlePresets] = useState<string[]>([]);
  const [agencyPresets, setAgencyPresets] = useState<AgencyProfile[]>([]);
  const [aboutPresets, setAboutPresets] = useState<AboutTemplate[]>([]);
  const [termsPresets, setTermsPresets] = useState<TermsTemplate[]>([]);

  // Collapsible Sections State
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleServiceDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setFormData((prev) => {
        const currentDetails = prev.data.overviewDetails || { clientDescription: prev.data.overview, services: [], finalDeliverable: '' };
        const oldIndex = (currentDetails.services || []).indexOf(active.id as string);
        const newIndex = (currentDetails.services || []).indexOf(over?.id as string);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newServices = arrayMove(currentDetails.services || [], oldIndex, newIndex);
          const newDetails = { ...currentDetails, services: newServices };

          // Rebuild overview string
          const parts = [];
          if (newDetails.clientDescription) parts.push(newDetails.clientDescription);
          if (newDetails.services?.length) parts.push(newDetails.services.map(s => `• ${s}`).join('\n'));
          if (newDetails.finalDeliverable) parts.push(newDetails.finalDeliverable);

          return {
            ...prev,
            data: { ...prev.data, overview: parts.join('\n\n'), overviewDetails: newDetails }
          };
        }
        return prev;
      });
    }
  };

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Update presets when configs load
  useEffect(() => {
    if (configs.titles.length > 0) setTitlePresets(prev => Array.from(new Set([...prev, ...configs.titles])));
  }, [configs.titles]);

  useEffect(() => {
    if (configs.agencies.length > 0) {
      // Ensure uniqueness by ID
      const unique = new Map();
      configs.agencies.forEach(item => unique.set(item.id, item));
      setAgencyPresets(Array.from(unique.values()));
    }
  }, [configs.agencies]);

  useEffect(() => {
    if (configs.aboutUs.length > 0) {
      // Map ConfigurationItem to AboutTemplate if needed (they are compatible)
      setAboutPresets(prev => {
        const combined = [...prev, ...configs.aboutUs];
        // Dedupe by ID
        const unique = new Map();
        combined.forEach(item => unique.set(item.id, item));
        return Array.from(unique.values());
      });
    }
  }, [configs.aboutUs]);

  useEffect(() => {
    if (configs.terms.length > 0) {
      setTermsPresets(prev => {
        const combined = [...prev, ...configs.terms];
        const unique = new Map();
        combined.forEach(item => unique.set(item.id, item));
        return Array.from(unique.values());
      });
    }
  }, [configs.terms]);


  // Management Dialog State
  const [manageType, setManageType] = useState<'title' | 'agency' | 'about' | 'terms' | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [newItemLabel, setNewItemLabel] = useState(''); // Only for About Us & Terms

  useEffect(() => {
    // Load presets from localStorage
    const saved = localStorage.getItem('proposal_presets');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.titles) setTitlePresets(prev => Array.from(new Set([...prev, ...parsed.titles])));
        if (parsed.agencies) {
          // Filter/Map as needed. If string[], convert. If AgencyProfile[], keep.
          const loaded = parsed.agencies.map((item: string | AgencyProfile) => {
            if (typeof item === 'string') return { id: `local-${Math.random()}`, name: item, email: '', signatureData: '' };
            return item;
          });
          setAgencyPresets(prev => {
            const unique = new Map();
            [...prev, ...loaded].forEach(i => unique.set(i.id || i.name, i));
            return Array.from(unique.values());
          });
        }
        if (parsed.aboutUs) {
          // Merge based on ID to avoid duplicates
          const currentIds = new Set(configs.aboutUs.map((t: { id: string }) => t.id)); // compare against DB
          const newTemplates = parsed.aboutUs.filter((t: AboutTemplate) => !currentIds.has(t.id));
          setAboutPresets(prev => {
            const combined = [...prev, ...newTemplates];
            const unique = new Map();
            combined.forEach(item => unique.set(item.id, item));
            return Array.from(unique.values());
          });
        }
        if (parsed.terms) {
          const currentIds = new Set(configs.terms.map((t: { id: string }) => t.id));
          const newTemplates = parsed.terms.filter((t: TermsTemplate) => !currentIds.has(t.id));
          setTermsPresets(prev => {
            const combined = [...prev, ...newTemplates];
            const unique = new Map();
            combined.forEach(item => unique.set(item.id, item));
            return Array.from(unique.values());
          });
        }
      } catch (e) {
        console.error("Failed to parse presets", e);
      }
    }
  }, [configs.aboutUs, configs.terms]); // Re-run local storage merge after configs load to ensure proper deduping? Or simpler: just merge.

  const savePresetsToStorage = (updates: Partial<{ titles: string[], agencies: string[], aboutUs: AboutTemplate[], terms: TermsTemplate[] }>) => {
    const current = JSON.parse(localStorage.getItem('proposal_presets') || '{}');
    const newState = { ...current, ...updates };
    localStorage.setItem('proposal_presets', JSON.stringify(newState));
  };

  const handleAddPreset = () => {
    if (!newItemText.trim()) return;

    if (manageType === 'title') {
      const newPresets = [...titlePresets, newItemText];
      setTitlePresets(newPresets);
      savePresetsToStorage({ titles: newPresets });
    } else if (manageType === 'agency') {
      // Create a default profile for quick add - though ideally user should use Settings page
      const newProfile: AgencyProfile = {
        id: `local-${Date.now()}`,
        name: newItemText,
        email: '', // Default empty
        signatureData: '' // Default empty
      };
      const newPresets = [...agencyPresets, newProfile];
      setAgencyPresets(newPresets);
      // savePresetsToStorage({ agencies: newPresets }); // Removed local storage save for agencies to avoid complexity with string vs object mismatch in this legacy function. 
    } else if (manageType === 'about') {
      const newTemplate: AboutTemplate = {
        id: `custom-${Date.now()}`,
        label: newItemLabel || 'Custom Template',
        text: newItemText
      };
      const newPresets = [...aboutPresets, newTemplate];
      setAboutPresets(newPresets);
      savePresetsToStorage({ aboutUs: newPresets });
    } else if (manageType === 'terms') {
      const newTemplate: TermsTemplate = {
        id: `custom-terms-${Date.now()}`,
        label: newItemLabel || 'Custom Terms',
        text: newItemText
      };
      const newPresets = [...termsPresets, newTemplate];
      setTermsPresets(newPresets);
      savePresetsToStorage({ terms: newPresets });
    }

    setNewItemText('');
    setNewItemLabel('');
  };

  const handleDeletePreset = (index: number) => {
    // Handling deletion is tricky with merged data. 
    // If it's a DB item, we can't delete it from here (read-only in this view). 
    // If it's local, we can.
    // Simplifying: Just remove from state and local storage. If it comes back from DB on reload, so be it.

    if (manageType === 'title') {
      const newPresets = titlePresets.filter((_, i) => i !== index);
      setTitlePresets(newPresets);
      savePresetsToStorage({ titles: newPresets });
    } else if (manageType === 'agency') {
      const newPresets = agencyPresets.filter((_, i) => i !== index);
      setAgencyPresets(newPresets);
      // savePresetsToStorage({ agencies: newPresets });
    } else if (manageType === 'about') {
      const newPresets = aboutPresets.filter((_, i) => i !== index);
      setAboutPresets(newPresets);
      savePresetsToStorage({ aboutUs: newPresets });
    } else if (manageType === 'terms') {
      const newPresets = termsPresets.filter((_, i) => i !== index);
      setTermsPresets(newPresets);
      savePresetsToStorage({ terms: newPresets });
    }
  };

  // Initialize formData with empty defaults, will populate when configs load or proposal prop is set
  const [formData, setFormData] = useState<Proposal>({
    id: '',
    title: '',
    clientName: '',
    agencyName: 'ActiveSet',
    heroImage: DEFAULT_HERO,
    status: 'draft',
    createdAt: new Date().toISOString().split('T')[0],
    updatedAt: new Date().toISOString().split('T')[0],
    data: {
      overview: '',
      aboutUs: '',
      pricing: {
        items: [{ name: '', price: '', description: '' }],
        total: ''
      },
      timeline: {
        phases: [{ title: '', description: '', duration: '', startDate: '' }]
      },
      terms: '',
      signatures: {
        agency: { name: '', email: '' },
        client: { name: '', email: '' }
      }
    }
  });

  // Populate default fields once configs are loaded
  useEffect(() => {
    if (!proposal && configs.aboutUs.length > 0 && !formData.data.aboutUs) {
      setFormData(prev => ({
        ...prev,
        data: { ...prev.data, aboutUs: configs.aboutUs[0].text }
      }));
    }
  }, [configs.aboutUs, proposal]);

  // Set default agency if creating new and presets exist
  useEffect(() => {
    if (!proposal && agencyPresets.length > 0 && !formData.data.signatures.agency.name) {
      const defaultAgency = agencyPresets[0];
      setFormData(prev => ({
        ...prev,
        agencyName: defaultAgency.name,
        data: {
          ...prev.data,
          signatures: {
            ...prev.data.signatures,
            agency: {
              name: defaultAgency.name,
              email: defaultAgency.email,
              signatureData: defaultAgency.signatureData
            }
          }
        }
      }));
    }
  }, [agencyPresets, proposal]);

  // Initial title select? 
  // Maybe better to leave empty until user selects.


  // Auto-format title when clientName changes, if the title matches one of the presets
  // Or rather, we should treat the "Title" field more like "Project Type" and construct the full title
  // But let's keep it simple: simpler logic or just let user edit.
  // Requirement: "For Proposal Title, it should be [Client name] – [Title]"
  // This implies we should maybe construct it. 
  // Let's modify the Title Selection to be "Project Type" selection, and update the formData.title

  const handleTitleSelect = (projectType: string) => {
    const client = formData.clientName || '[Client]';
    const newTitle = `${client} — ${projectType}`;
    setFormData(prev => ({ ...prev, title: newTitle }));
  };

  const handleClientNameChange = (name: string) => {
    setFormData(prev => {
      let newTitle = prev.title;

      // If title contains [Client] placeholder, replace it with the new name
      if (prev.title.includes('[Client]')) {
        newTitle = prev.title.replace('[Client]', name || '[Client]');
      }
      // If title starts with old client name followed by " — ", update it
      else if (prev.clientName && prev.title.startsWith(`${prev.clientName} — `)) {
        newTitle = prev.title.replace(`${prev.clientName} — `, `${name || '[Client]'} — `);
      }

      return { ...prev, clientName: name, title: newTitle };
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, heroImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (proposal) {
      setFormData(proposal);
    }
  }, [proposal]);

  const handleSave = () => {
    const updatedProposal = {
      ...formData,
      updatedAt: new Date().toISOString().split('T')[0]
    };
    onSave(updatedProposal);
  };

  const generateAIContent = async () => {
    if (!meetingNotes.trim()) return;

    setAiLoading(true);
    setAiError(null);

    try {
      const response = await fetch('/api/ai-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingNotes,
          clientName: formData.clientName,
          agencyName: formData.agencyName,
          clientWebsite,
          projectDeadline,
          projectBudget
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate content');
      }

      const { data } = result;

      // Auto-fill form with AI-generated content
      setFormData(prev => ({
        ...prev,
        title: data.title || prev.title,
        clientName: data.clientName || prev.clientName,
        data: {
          ...prev.data,
          overview: data.overview || prev.data.overview,
          overviewDetails: {
            ...prev.data.overviewDetails,
            clientDescription: data.clientDescription || prev.data.overviewDetails?.clientDescription || '',
            services: data.serviceKeys?.map((key: string) => configs.serviceSnippets[key] || key) || prev.data.overviewDetails?.services || [],
            finalDeliverable: data.finalDeliverable || prev.data.overviewDetails?.finalDeliverable || ''
          },
          aboutUs: data.aboutUsTemplateId
            ? configs.aboutUs.find((t: { id: string; text: string }) => t.id === data.aboutUsTemplateId)?.text || prev.data.aboutUs
            : prev.data.aboutUs,
          pricing: {
            ...prev.data.pricing,
            items: data.pricingItems?.length > 0
              ? data.pricingItems.map((item: { name: string; description?: string; price: string }) => ({
                name: item.name,
                description: item.description || '',
                price: item.price
              }))
              : prev.data.pricing.items,
            total: data.pricingTotal || projectBudget || prev.data.pricing.total
          },
          timeline: {
            ...prev.data.timeline,
            phases: data.timelinePhases?.length > 0
              ? data.timelinePhases.map((phase: { title: string; description: string; duration: string; startDate?: string; endDate?: string }) => ({
                title: phase.title,
                description: phase.description,
                duration: phase.duration,
                startDate: phase.startDate || '',
                endDate: phase.endDate || ''
              }))
              : prev.data.timeline.phases
          }
        }
      }));

      // Rebuild overview string if details provided
      if (data.clientDescription || data.serviceKeys || data.finalDeliverable) {
        setFormData(current => {
          const details = current.data.overviewDetails || { clientDescription: '', services: [], finalDeliverable: '' };
          const parts = [];
          if (details.clientDescription) parts.push(details.clientDescription);
          if (details.services?.length) parts.push(details.services.map((s: string) => `• ${s}`).join('\n'));
          if (details.finalDeliverable) parts.push(details.finalDeliverable);

          return {
            ...current,
            data: { ...current.data, overview: parts.join('\n\n') }
          };
        });
      }

      setAiDialogOpen(false);
      setMeetingNotes('');
      setClientWebsite('');
      setProjectDeadline('');
      setProjectBudget('');
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setAiLoading(false);
    }
  };

  const addPricingItem = () => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        pricing: {
          ...prev.data.pricing,
          items: [...prev.data.pricing.items, { name: '', price: '' }]
        }
      }
    }));
  };

  const removePricingItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        pricing: {
          ...prev.data.pricing,
          items: prev.data.pricing.items.filter((_, i) => i !== index)
        }
      }
    }));
  };

  const updatePricingItem = (index: number, field: 'name' | 'price' | 'description', value: string) => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        pricing: {
          ...prev.data.pricing,
          items: prev.data.pricing.items.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
          )
        }
      }
    }));
  };

  const addTimelinePhase = () => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        timeline: {
          phases: [...prev.data.timeline.phases, { title: '', description: '', duration: '', startDate: '', endDate: '' }]
        }
      }
    }));
  };

  const removeTimelinePhase = (index: number) => {
    setFormData(prev => ({
      ...prev,
      data: {
        ...prev.data,
        timeline: {
          phases: prev.data.timeline.phases.filter((_, i) => i !== index)
        }
      }
    }));
  };

  const calculateDuration = (start: string, end: string): string => {
    if (!start || !end) return '';
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive of start and end date

    if (diffDays % 7 === 0 && diffDays !== 0) {
      const weeks = diffDays / 7;
      return `${weeks} week${weeks > 1 ? 's' : ''}`;
    }
    return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  };

  const updateTimelinePhase = (index: number, field: 'title' | 'description' | 'duration' | 'startDate' | 'endDate' | 'dependsOn', value: string | number | undefined) => {
    setFormData(prev => {
      const currentPhases = prev.data.timeline.phases;
      const currentPhase = currentPhases[index];

      let newDuration = currentPhase.duration;

      // Auto-calculate duration if dates change
      if (field === 'startDate' || field === 'endDate') {
        const start = field === 'startDate' ? value as string : currentPhase.startDate;
        const end = field === 'endDate' ? value as string : currentPhase.endDate;
        if (start && end) {
          newDuration = calculateDuration(start, end);
        }
      }

      return {
        ...prev,
        data: {
          ...prev.data,
          timeline: {
            phases: currentPhases.map((phase, i) =>
              i === index ? { ...phase, [field]: value, duration: newDuration } : phase
            )
          }
        }
      };
    });
  };



  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className={`sticky top-0 z-20 border-b px-4 py-3 ${isEditingTemplate ? 'bg-purple-950/50 border-purple-500/30' : 'bg-card border-border'}`}>
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={onCancel} className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              {isEditingTemplate && (
                <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Template
                </span>
              )}
              <h1 className="text-xl font-semibold text-foreground">
                {isEditingTemplate ? `Edit Template: ${editingTemplate.name}` : proposal ? 'Edit Proposal' : 'Create New Proposal'}
              </h1>
            </div>
          </div>

          {isEditingTemplate ? (
            /* Template Editing Mode CTAs */
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setAiDialogOpen(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/30 hover:border-purple-500/50 hover:bg-purple-500/20"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                AI Fill
              </Button>
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmOpen(true)}
                className="flex items-center gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
              >
                <Trash2 className="w-4 h-4" />
                Delete Template
              </Button>
              <Button
                onClick={() => {
                  onSaveAsTemplate(templateName || editingTemplate.name, formData.data);
                  onCancel();
                }}
                disabled={loading}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="w-4 h-4" /> Save Template</>
                )}
              </Button>
            </div>
          ) : (
            /* Normal Proposal Mode CTAs */
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setAiDialogOpen(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/30 hover:border-purple-500/50 hover:bg-purple-500/20"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                AI Fill
              </Button>
              <Button
                variant="outline"
                onClick={() => setTemplateDialogOpen(true)}
                className="flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Save as Template
              </Button>
              <Button onClick={handleSave} disabled={loading} className="flex items-center gap-2">
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="w-4 h-4" /> Save Proposal</>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Delete Template Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Template
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the template &quot;{editingTemplate?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDeleteTemplate?.();
                setDeleteConfirmOpen(false);
                onCancel();
              }}
            >
              Delete Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Save this proposal as a template to reuse for future proposals.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="templateName">Template Name</Label>
            <Input
              id="templateName"
              placeholder="e.g., Standard Website Proposal"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (templateName.trim()) {
                  onSaveAsTemplate(templateName.trim(), formData.data);
                  setTemplateName('');
                  setTemplateDialogOpen(false);
                }
              }}
              disabled={!templateName.trim()}
            >
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Fill Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={(open) => { setAiDialogOpen(open); if (!open) setAiError(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              AI Content Generator
            </DialogTitle>
            <DialogDescription>
              Paste your meeting notes, client brief, or project requirements. Our AI will analyze the content and auto-fill the proposal fields.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4 overflow-y-auto flex-1">
            <div>
              <Label htmlFor="meetingNotes">Meeting Notes / Brief</Label>
              <Textarea
                id="meetingNotes"
                placeholder="Paste your meeting notes, discovery call transcript, client requirements, or project brief here...

Example:
- Client: Acme Corp
- Project: Website redesign
- Budget: $10,000
- Timeline: 6-8 weeks
- Requirements: Modern design, mobile-first, CMS integration..."
                value={meetingNotes}
                onChange={(e) => setMeetingNotes(e.target.value)}
                className="mt-2 h-[200px] font-mono text-sm resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clientWebsite">Client Website (Optional)</Label>
                <Input
                  id="clientWebsite"
                  placeholder="https://example.com"
                  value={clientWebsite}
                  onChange={(e) => setClientWebsite(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="projectDeadline">Project Deadline (Optional)</Label>
                <div className="mt-2">
                  <DatePicker
                    value={projectDeadline}
                    onChange={(value) => setProjectDeadline(value)}
                    placeholder="Select deadline"
                  />
                </div>
              </div>
              <div className="col-span-2">
                <Label htmlFor="projectBudget">Final Budget (Optional)</Label>
                <Input
                  id="projectBudget"
                  placeholder="e.g. $3000, €5000"
                  value={projectBudget}
                  onChange={(e) => setProjectBudget(e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
            {aiError && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                {aiError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)} disabled={aiLoading}>
              Cancel
            </Button>
            <Button
              onClick={generateAIContent}
              disabled={!meetingNotes.trim() || aiLoading}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              {aiLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Generate Content</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split Screen Layout */}
      <div className="max-w-screen-2xl mx-auto p-4 flex gap-6">

        {/* Progress Sidebar */}
        <div className="w-56 shrink-0 hidden lg:block">
          <div className="sticky top-20 space-y-4">
            {/* Progress Header */}
            <div className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Progress</span>
                <span className="text-sm font-semibold text-primary">{(() => {
                  let completed = 0;
                  const total = 8;
                  if (formData.heroImage) completed++;
                  if (formData.title && formData.clientName) completed++;
                  if (formData.data.overview) completed++;
                  if (formData.data.aboutUs) completed++;
                  if (formData.data.pricing.items.some(i => i.name && i.price)) completed++;
                  if (formData.data.timeline.phases.some(p => p.title)) completed++;
                  if (formData.data.terms) completed++;
                  if (formData.data.signatures.agency.name || formData.data.signatures.client.name) completed++;
                  return Math.round((completed / total) * 100);
                })()}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{
                    width: `${(() => {
                      let completed = 0;
                      const total = 8;
                      if (formData.heroImage) completed++;
                      if (formData.title && formData.clientName) completed++;
                      if (formData.data.overview) completed++;
                      if (formData.data.aboutUs) completed++;
                      if (formData.data.pricing.items.some(i => i.name && i.price)) completed++;
                      if (formData.data.timeline.phases.some(p => p.title)) completed++;
                      if (formData.data.terms) completed++;
                      if (formData.data.signatures.agency.name || formData.data.signatures.client.name) completed++;
                      return (completed / total) * 100;
                    })()}%`
                  }}
                />
              </div>
            </div>

            {/* Section Navigation */}
            <nav className="bg-card rounded-lg border border-border p-2 space-y-1">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Sections
              </div>
              {[
                { id: 'hero', label: 'Hero Image', icon: '🖼️', complete: !!formData.heroImage },
                { id: 'basic', label: 'Basic Info', icon: '📝', complete: !!(formData.title && formData.clientName) },
                { id: 'overview', label: 'Overview', icon: '📋', complete: !!formData.data.overview },
                { id: 'about', label: 'About Us', icon: '🏢', complete: !!formData.data.aboutUs },
                { id: 'pricing', label: 'Pricing', icon: '💰', complete: formData.data.pricing.items.some(i => i.name && i.price) },
                { id: 'timeline', label: 'Timeline', icon: '📅', complete: formData.data.timeline.phases.some(p => p.title) },
                { id: 'terms', label: 'Terms', icon: '📄', complete: !!formData.data.terms },
                { id: 'signatures', label: 'Signatures', icon: '✍️', complete: !!(formData.data.signatures.agency.name || formData.data.signatures.client.name) },
              ].map((section) => (
                <button
                  key={section.id}
                  onClick={() => {
                    const el = document.getElementById(`section-${section.id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent transition-colors text-left group"
                >
                  <span className="text-base">{section.icon}</span>
                  <span className="flex-1 text-sm text-foreground">{section.label}</span>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${section.complete
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-muted text-muted-foreground'
                    }`}>
                    {section.complete ? '✓' : '○'}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Left: Form Editor */}
        <div className="flex-1 space-y-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>

          {/* Hero Image Card */}
          <Card id="section-hero">
            <CardHeader className="cursor-pointer select-none" onClick={() => toggleSection('section-hero')}>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  Hero Image
                </CardTitle>
                {collapsedSections['section-hero'] ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </div>
            </CardHeader>
            {!collapsedSections['section-hero'] && (
              <CardContent>
                <div className="space-y-4">
                  <div
                    className="relative h-32 rounded-lg overflow-hidden border-2 border-dashed border-border hover:border-primary transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      backgroundImage: `url(${formData.heroImage || DEFAULT_HERO})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}
                  >
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <div className="text-white text-center">
                        <Upload className="w-8 h-8 mx-auto mb-2" />
                        <span className="text-sm">Click to upload</span>
                      </div>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFormData(prev => ({ ...prev, heroImage: DEFAULT_HERO }))}
                    >
                      Reset to Default
                    </Button>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Basic Information */}
          <Card id="section-basic">
            <CardHeader className="cursor-pointer select-none" onClick={() => toggleSection('section-basic')}>
              <div className="flex items-center justify-between">
                <CardTitle>Basic Information</CardTitle>
                {collapsedSections['section-basic'] ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </div>
            </CardHeader>
            {!collapsedSections['section-basic'] && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="title">Proposal Title</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setManageType('title')}
                      >
                        <Settings className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          id="title"
                          placeholder="e.g., Acme Corp – Website Development"
                          value={formData.title}
                          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                        />
                      </div>
                      <Select onValueChange={handleTitleSelect}>
                        <SelectTrigger className="w-[40px] px-2">
                          <span className="sr-only">Select Title Template</span>
                        </SelectTrigger>
                        <SelectContent>
                          {titlePresets.map((title, i) => (
                            <SelectItem key={i} value={title}>
                              {title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clientName">Client Name</Label>
                    <Input
                      id="clientName"
                      placeholder="e.g., Acme Corporation"
                      value={formData.clientName}
                      onChange={(e) => handleClientNameChange(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="agencyName">Agency Name</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setManageType('agency')}
                    >
                      <Settings className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        id="agencyName"
                        placeholder="e.g., Your Agency Name"
                        value={formData.agencyName}
                        onChange={(e) => setFormData(prev => ({ ...prev, agencyName: e.target.value }))}
                      />
                    </div>
                    <Select onValueChange={(agencyId) => {
                      const selected = agencyPresets.find(a => a.id === agencyId);
                      if (selected) {
                        setFormData(prev => ({
                          ...prev,
                          agencyName: selected.name, // Update top-level name
                          data: {
                            ...prev.data,
                            signatures: {
                              ...prev.data.signatures,
                              agency: {
                                name: selected.name,
                                email: selected.email,
                                signatureData: selected.signatureData
                              }
                            }
                          }
                        }));
                      }
                    }}>
                      <SelectTrigger className="w-[40px] px-2">
                        <span className="sr-only">Select Agency</span>
                      </SelectTrigger>
                      <SelectContent>
                        {agencyPresets.map((agency) => (
                          <SelectItem key={agency.id} value={agency.id}>
                            {agency.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Overview */}
          <Card id="section-overview">
            <CardHeader className="cursor-pointer select-none" onClick={() => toggleSection('section-overview')}>
              <div className="flex items-center justify-between">
                <CardTitle>Overview</CardTitle>
                {collapsedSections['section-overview'] ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </div>
            </CardHeader>
            {!collapsedSections['section-overview'] && (
              <CardContent>
                <div className="space-y-6">
                  {/* 1. Client Description */}
                  <div className="space-y-2">
                    <Label htmlFor="clientDescription">Client Description</Label>
                    <Textarea
                      id="clientDescription"
                      placeholder="[Company Name] is a [industry/type] company that [what they do]. [Additional context about the company]..."
                      className="min-h-[100px]"
                      value={formData.data.overviewDetails?.clientDescription ?? formData.data.overview}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setFormData(prev => {
                          const currentDetails = prev.data.overviewDetails || { clientDescription: prev.data.overview, services: [], finalDeliverable: '' };
                          const newDetails = { ...currentDetails, clientDescription: newVal };

                          // Rebuild full overview string
                          const parts = [];
                          if (newDetails.clientDescription) parts.push(newDetails.clientDescription);
                          if (newDetails.services?.length) parts.push(newDetails.services.map(s => `• ${s}`).join('\n'));
                          if (newDetails.finalDeliverable) parts.push(newDetails.finalDeliverable);

                          return {
                            ...prev,
                            data: { ...prev.data, overview: parts.join('\n\n'), overviewDetails: newDetails }
                          };
                        });
                      }}
                    />
                  </div>

                  {/* 2. Services List */}
                  <div className="space-y-2">
                    <Label>Services (Itemized List)</Label>
                    {/* Current Services List */}
                    {formData.data.overviewDetails?.services && formData.data.overviewDetails.services.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleServiceDragEnd}
                        >
                          <SortableContext
                            items={formData.data.overviewDetails.services}
                            strategy={verticalListSortingStrategy}
                          >
                            {formData.data.overviewDetails.services.map((service, idx) => (
                              <SortableServiceItem
                                key={service} // Using text as key/id is risky if duplicates, but matching data model
                                id={service}
                                service={service}
                                onRemove={() => {
                                  setFormData(prev => {
                                    const currentDetails = prev.data.overviewDetails || { clientDescription: prev.data.overview, services: [], finalDeliverable: '' };
                                    const newServices = [...(currentDetails.services || [])];
                                    newServices.splice(idx, 1);
                                    const newDetails = { ...currentDetails, services: newServices };

                                    const parts = [];
                                    if (newDetails.clientDescription) parts.push(newDetails.clientDescription);
                                    if (newDetails.services?.length) parts.push(newDetails.services.map(s => `• ${s}`).join('\n'));
                                    if (newDetails.finalDeliverable) parts.push(newDetails.finalDeliverable);

                                    return {
                                      ...prev,
                                      data: { ...prev.data, overview: parts.join('\n\n'), overviewDetails: newDetails }
                                    };
                                  });
                                }}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic mb-2">No services added yet. Select from below to add.</div>
                    )}

                    {/* Add Services Buttons */}
                    <Label className="text-xs text-muted-foreground">Add Service items:</Label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(configs.serviceSnippets).map(([key, text]) => (
                        <Button
                          key={key}
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => {
                            setFormData(prev => {
                              const currentDetails = prev.data.overviewDetails || { clientDescription: prev.data.overview, services: [], finalDeliverable: '' };
                              const newServices = [...(currentDetails.services as string[] || []), text];
                              const newDetails = { ...currentDetails, services: newServices };

                              const parts = [];
                              if (newDetails.clientDescription) parts.push(newDetails.clientDescription);
                              if (newDetails.services?.length) parts.push(newDetails.services.map(s => `• ${s}`).join('\n'));
                              if (newDetails.finalDeliverable) parts.push(newDetails.finalDeliverable);

                              return {
                                ...prev,
                                data: { ...prev.data, overview: parts.join('\n\n'), overviewDetails: newDetails }
                              };
                            });
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          {key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Final Deliverable */}
                  <div className="space-y-2">
                    <Label htmlFor="finalDeliverable">Final Deliverable Statement</Label>
                    <Textarea
                      id="finalDeliverable"
                      placeholder="The final deliverable for this project will be..."
                      className="min-h-[80px]"
                      value={formData.data.overviewDetails?.finalDeliverable || ''}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setFormData(prev => {
                          const currentDetails = prev.data.overviewDetails || { clientDescription: prev.data.overview, services: [], finalDeliverable: '' };
                          const newDetails = { ...currentDetails, finalDeliverable: newVal };

                          const parts = [];
                          if (newDetails.clientDescription) parts.push(newDetails.clientDescription);
                          if (newDetails.services?.length) parts.push(newDetails.services.map(s => `• ${s}`).join('\n'));
                          if (newDetails.finalDeliverable) parts.push(newDetails.finalDeliverable);

                          return {
                            ...prev,
                            data: { ...prev.data, overview: parts.join('\n\n'), overviewDetails: newDetails }
                          };
                        });
                      }}
                    />
                    {/* Preset Buttons for Final Deliverable */}
                    <div className="flex gap-2 flex-wrap">
                      {configs.deliverables.map((deliverable: { id: string; text: string; label: string }) => (
                        <Button
                          key={deliverable.id}
                          variant="ghost"
                          size="sm"
                          className="text-xs h-6 px-2 border border-dashed"
                          onClick={() => {
                            setFormData(prev => {
                              const currentDetails = prev.data.overviewDetails || { clientDescription: prev.data.overview, services: [], finalDeliverable: '' };
                              const newDetails = { ...currentDetails, finalDeliverable: deliverable.text };

                              const parts = [];
                              if (newDetails.clientDescription) parts.push(newDetails.clientDescription);
                              if (newDetails.services?.length) parts.push(newDetails.services.map(s => `• ${s}`).join('\n'));
                              if (newDetails.finalDeliverable) parts.push(newDetails.finalDeliverable);

                              return {
                                ...prev,
                                data: { ...prev.data, overview: parts.join('\n\n'), overviewDetails: newDetails }
                              };
                            });
                          }}
                        >
                          Apply: {deliverable.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* About Us */}
          <Card id="section-about">
            <CardHeader className="cursor-pointer select-none" onClick={() => toggleSection('section-about')}>
              <div className="flex items-center justify-between">
                <CardTitle>About Us</CardTitle>
                {collapsedSections['section-about'] ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </div>
            </CardHeader>
            {!collapsedSections['section-about'] && (
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Use a Template</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setManageType('about')}
                      >
                        <Settings className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </div>
                    <Select onValueChange={(value) => {
                      const template = aboutPresets.find(t => t.id === value);
                      if (template) {
                        setFormData(prev => ({
                          ...prev,
                          data: { ...prev.data, aboutUs: template.text }
                        }));
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {aboutPresets.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="aboutUs">Content</Label>
                    <RichTextEditor
                      value={formData.data.aboutUs}
                      onChange={(value) => setFormData(prev => ({
                        ...prev,
                        data: { ...prev.data, aboutUs: value }
                      }))}
                      placeholder="Tell the client about your agency..."
                    />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Pricing */}
          <Card id="section-pricing">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('section-pricing')}>
                  <CardTitle>Pricing</CardTitle>
                  {collapsedSections['section-pricing'] ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </div>
                {!collapsedSections['section-pricing'] && (
                  <Button variant="outline" onClick={addPricingItem} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Add Item
                  </Button>
                )}
              </div>
            </CardHeader>
            {!collapsedSections['section-pricing'] && (
              <CardContent className="space-y-4">
                {formData.data.pricing.items.map((item, index) => (
                  <div key={index} className="space-y-2 p-3 border rounded-md">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="Service name"
                        value={item.name}
                        onChange={(e) => updatePricingItem(index, 'name', e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Price"
                        value={item.price}
                        onChange={(e) => updatePricingItem(index, 'price', e.target.value)}
                        className="w-full sm:w-32"
                      />
                      {formData.data.pricing.items.length > 1 && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => removePricingItem(index)}
                          className="shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {/* <Textarea
                    placeholder="Service description / details..."
                    value={item.description || ''}
                    onChange={(e) => updatePricingItem(index, 'description', e.target.value)}
                    className="min-h-[60px] text-sm"
                  /> */}
                    <div className="h-[200px]">
                      <RichTextEditor
                        value={item.description || ''}
                        onChange={(value) => updatePricingItem(index, 'description', value)}
                        placeholder="Service description / details..."
                        className="h-full"
                        simple={true}
                      />
                    </div>
                  </div>
                ))}
                <Separator />
                <div className="flex flex-col sm:flex-row gap-2">
                  <Label className="text-lg font-medium flex-1">Total</Label>
                  <Input
                    placeholder="Total amount (e.g., € 5,000)"
                    value={formData.data.pricing.total}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      data: {
                        ...prev.data,
                        pricing: { ...prev.data.pricing, total: e.target.value }
                      }
                    }))}
                    className="w-full sm:w-32"
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* Timeline */}
          <Card id="section-timeline">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection('section-timeline')}>
                  <CardTitle>Timeline</CardTitle>
                  {collapsedSections['section-timeline'] ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </div>
                {!collapsedSections['section-timeline'] && (
                  <Button variant="outline" onClick={addTimelinePhase} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Add Phase
                  </Button>
                )}
              </div>
            </CardHeader>
            {!collapsedSections['section-timeline'] && (
              <CardContent className="space-y-4">
                {formData.data.timeline.phases.map((phase, index) => (
                  <div key={index} className="space-y-2 p-4 border rounded-lg">
                    <div className="flex justify-between items-start">
                      <Label className="text-sm text-muted-foreground">Phase {index + 1}</Label>
                      {formData.data.timeline.phases.length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeTimelinePhase(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <Input
                      placeholder="Phase title"
                      value={phase.title}
                      onChange={(e) => updateTimelinePhase(index, 'title', e.target.value)}
                    />
                    {/* <Textarea
                    placeholder="Phase description"
                    value={phase.description}
                    onChange={(e) => updateTimelinePhase(index, 'description', e.target.value)}
                  /> */}
                    <div className="h-[200px]">
                      <RichTextEditor
                        value={phase.description}
                        onChange={(value) => updateTimelinePhase(index, 'description', value)}
                        placeholder="Phase description"
                        className="h-full"
                        simple={true}
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Start Date</Label>
                        <DatePicker
                          value={phase.startDate || ''}
                          onChange={(value) => updateTimelinePhase(index, 'startDate', value)}
                          placeholder="Select start date"
                        />
                      </div>
                      <div className="flex-1 flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">End Date</Label>
                        <DatePicker
                          value={phase.endDate || ''}
                          onChange={(value) => updateTimelinePhase(index, 'endDate', value)}
                          placeholder="Select end date"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Duration (optional if dates set)</Label>
                        <Input
                          placeholder="Auto-calculated"
                          value={phase.duration}
                          readOnly
                          className="bg-muted text-muted-foreground cursor-not-allowed"
                          onChange={() => { }} // Read-only
                        />
                      </div>
                      {index > 0 && (
                        <div className="flex-1 flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Depends On</Label>
                          <Select
                            value={phase.dependsOn !== undefined ? String(phase.dependsOn) : ''}
                            onValueChange={(value) => updateTimelinePhase(index, 'dependsOn', value === 'none' ? undefined : Number(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="No dependency" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No dependency</SelectItem>
                              {formData.data.timeline.phases.slice(0, index).map((p, i) => (
                                <SelectItem key={i} value={String(i)}>
                                  Phase {i + 1}: {p.title || '(Untitled)'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>

          {/* Terms */}
          <Card id="section-terms">
            <CardHeader className="cursor-pointer select-none" onClick={() => toggleSection('section-terms')}>
              <div className="flex items-center justify-between">
                <CardTitle>Terms & Conditions</CardTitle>
                {collapsedSections['section-terms'] ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </div>
            </CardHeader>
            {!collapsedSections['section-terms'] && (
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Use a Template</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setManageType('terms')}
                      >
                        <Settings className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </div>
                    <Select onValueChange={(value) => {
                      const template = termsPresets.find(t => t.id === value);
                      if (template) {
                        setFormData(prev => ({
                          ...prev,
                          data: { ...prev.data, terms: template.text }
                        }));
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {termsPresets.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="terms">Content</Label>
                    <RichTextEditor
                      value={formData.data.terms}
                      onChange={(value) => setFormData(prev => ({
                        ...prev,
                        data: { ...prev.data, terms: value }
                      }))}
                      placeholder="Enter terms and conditions..."
                    />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Signatures */}
          <Card id="section-signatures">
            <CardHeader className="cursor-pointer select-none" onClick={() => toggleSection('section-signatures')}>
              <div className="flex items-center justify-between">
                <CardTitle>Signatures</CardTitle>
                {collapsedSections['section-signatures'] ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </div>
            </CardHeader>
            {!collapsedSections['section-signatures'] && (
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-medium">Agency Representative</h4>
                    <div className="space-y-2">
                      <Label htmlFor="agencySignatureName">Name</Label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            id="agencySignatureName"
                            placeholder="Full name"
                            value={formData.data.signatures.agency.name}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              data: {
                                ...prev.data,
                                signatures: {
                                  ...prev.data.signatures,
                                  agency: { ...prev.data.signatures.agency, name: e.target.value }
                                }
                              }
                            }))}
                          />
                        </div>
                        <Select onValueChange={(agencyId) => {
                          const selected = agencyPresets.find(a => a.id === agencyId);
                          if (selected) {
                            setFormData(prev => ({
                              ...prev,
                              agencyName: selected.name, // optional: sync top level or keep separate? distinct typically better.
                              data: {
                                ...prev.data,
                                signatures: {
                                  ...prev.data.signatures,
                                  agency: {
                                    name: selected.name,
                                    email: selected.email,
                                    signatureData: selected.signatureData
                                  }
                                }
                              }
                            }));
                          }
                        }}>
                          <SelectTrigger className="w-[40px] px-2">
                            <span className="sr-only">Select Agency Representative</span>
                          </SelectTrigger>
                          <SelectContent>
                            {agencyPresets.map((agency) => (
                              <SelectItem key={agency.id} value={agency.id}>
                                {agency.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agencySignatureEmail">Email</Label>
                      <Input
                        id="agencySignatureEmail"
                        type="email"
                        placeholder="email@company.com"
                        value={formData.data.signatures.agency.email}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          data: {
                            ...prev.data,
                            signatures: {
                              ...prev.data.signatures,
                              agency: { ...prev.data.signatures.agency, email: e.target.value }
                            }
                          }
                        }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Client Representative</h4>
                    <div className="space-y-2">
                      <Label htmlFor="clientSignatureName">Name</Label>
                      <Input
                        id="clientSignatureName"
                        placeholder="Full name"
                        value={formData.data.signatures.client.name}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          data: {
                            ...prev.data,
                            signatures: {
                              ...prev.data.signatures,
                              client: { ...prev.data.signatures.client, name: e.target.value }
                            }
                          }
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clientSignatureEmail">Email</Label>
                      <Input
                        id="clientSignatureEmail"
                        type="email"
                        placeholder="email@client.com"
                        value={formData.data.signatures.client.email}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          data: {
                            ...prev.data,
                            signatures: {
                              ...prev.data.signatures,
                              client: { ...prev.data.signatures.client, email: e.target.value }
                            }
                          }
                        }))}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-4 justify-end pb-6">
            <Button variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading} className="flex items-center gap-2">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              ) : (
                <><Save className="w-4 h-4" /> Save Proposal</>
              )}
            </Button>
          </div>
        </div>

        {/* Right: Live Preview */}
        <div className="w-[400px] flex-shrink-0 sticky top-20" style={{ height: 'calc(100vh - 100px)' }}>
          <Card className="h-full">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-hidden" style={{ height: 'calc(100% - 50px)' }}>
              <div className="overflow-y-auto h-full">
                <LivePreview proposal={formData} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Management Dialog */}
      <Dialog open={!!manageType} onOpenChange={() => {
        setManageType(null);
        setNewItemText('');
        setNewItemLabel('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Manage {manageType === 'title' ? 'Titles' : manageType === 'agency' ? 'Agency Names' : manageType === 'about' ? 'About Us Templates' : 'Terms Templates'}
            </DialogTitle>
            <DialogDescription>
              Add or remove saved options for easy access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="space-y-2">
              <Label>Add New</Label>
              {(manageType === 'about' || manageType === 'terms') && (
                <Input
                  placeholder="Template Name"
                  value={newItemLabel}
                  onChange={(e) => setNewItemLabel(e.target.value)}
                  className="mb-2"
                />
              )}
              <div className="flex gap-2">
                {(manageType === 'about' || manageType === 'terms') ? (
                  <Textarea
                    placeholder="Template content..."
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    className="flex-1"
                  />
                ) : (
                  <Input
                    placeholder={manageType === 'title' ? "New Title" : "New Agency Name"}
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                  />
                )}
                <Button onClick={handleAddPreset} disabled={!newItemText.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Saved Options</Label>
              <div className="max-h-[200px] overflow-y-auto space-y-2 border rounded-md p-2">
                {manageType === 'title' && titlePresets.map((item, i) => (
                  <div key={i} className="flex justify-between items-center bg-muted p-2 rounded">
                    <span className="text-sm truncate">{item}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleDeletePreset(i)}>
                      <X className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
                {manageType === 'agency' && agencyPresets.map((item, i) => (
                  <div key={i} className="flex justify-between items-center bg-muted p-2 rounded">
                    <span className="text-sm truncate">{item.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleDeletePreset(i)}>
                      <X className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
                {manageType === 'about' && aboutPresets.map((item, i) => (
                  <div key={item.id} className="flex justify-between items-center bg-muted p-2 rounded">
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-sm font-medium truncate">{item.label}</span>
                      <span className="text-xs text-muted-foreground truncate">{item.text.substring(0, 40)}...</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDeletePreset(i)}>
                      <X className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
                {manageType === 'terms' && termsPresets.map((item, i) => (
                  <div key={item.id} className="flex justify-between items-center bg-muted p-2 rounded">
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-sm font-medium truncate">{item.label}</span>
                      <span className="text-xs text-muted-foreground truncate">{item.text.substring(0, 40)}...</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDeletePreset(i)}>
                      <X className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setManageType(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}