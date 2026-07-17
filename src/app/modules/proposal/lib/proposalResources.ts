import { Globe, Figma, Github, FileText, FlaskConical, SearchCheck, Link2, type LucideIcon } from 'lucide-react';
import type { ProposalResource, ProposalResourceKind } from '../types/Proposal';

// Presentation metadata per resource kind. Colors are hex because the
// ProposalViewer is a fixed light-theme "paper" that also renders to PDF.
export const RESOURCE_KIND_META: Record<ProposalResourceKind, { label: string; icon: LucideIcon; color: string; bg: string }> = {
    audit:   { label: 'Audit Report', icon: SearchCheck,  color: '#7c3aed', bg: '#f3e8ff' },
    website: { label: 'Website',      icon: Globe,        color: '#2563eb', bg: '#dbeafe' },
    figma:   { label: 'Figma',        icon: Figma,        color: '#db2777', bg: '#fce7f3' },
    staging: { label: 'Staging',      icon: FlaskConical, color: '#d97706', bg: '#fef3c7' },
    repo:    { label: 'Repository',   icon: Github,       color: '#374151', bg: '#f3f4f6' },
    doc:     { label: 'Document',     icon: FileText,     color: '#059669', bg: '#d1fae5' },
    other:   { label: 'Link',         icon: Link2,        color: '#6b7280', bg: '#f3f4f6' },
};

// Best-effort kind detection from the URL (and label as a tie-breaker).
// Explicit `kind` on the resource always wins — see resolveResourceKind.
export const detectResourceKind = (url: string, label = ''): ProposalResourceKind => {
    const u = url.toLowerCase();
    const l = label.toLowerCase();
    if (l.includes('audit') || /\/(audit|share)\//.test(u)) return 'audit';
    if (u.includes('figma.com')) return 'figma';
    if (/github\.com|gitlab\.com|bitbucket\.org/.test(u)) return 'repo';
    if (/webflow\.io|vercel\.app|netlify\.app|pages\.dev|staging\./.test(u)) return 'staging';
    if (/docs\.google|drive\.google|notion\.(so|site)|dropbox\.com|loom\.com/.test(u)) return 'doc';
    if (/^https?:\/\//.test(u)) return 'website';
    return 'other';
};

export const resolveResourceKind = (resource: ProposalResource): ProposalResourceKind =>
    resource.kind || detectResourceKind(resource.url, resource.label);

export const resourceHostname = (url: string): string => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
};
