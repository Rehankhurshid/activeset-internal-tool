'use client';

import React, { useState } from 'react';
import { QAChecklistItem, QAScanResult } from '@/types/qa';
import { QAChecklist } from './QAChecklist';

// Initial Checklist Data based on "Designer Defaults"
const INITIAL_CHECKLIST: QAChecklistItem[] = [
    {
        id: 'relume-starter',
        label: 'Clone Relume Starter Template',
        category: 'Project Setup',
        status: 'pending',
        verificationType: 'manual',
        description: 'Start the project using the Relume Library Styleguide.'
    },
    {
        id: 'upload-fonts',
        label: 'Upload Fonts',
        category: 'Fonts',
        status: 'pending',
        verificationType: 'automated',
        verificationEndpoint: '/api/qa/scan-fonts',
        description: 'All fonts must be in WOFF2 format.'
    },
    {
        id: 'styleguide-body',
        label: 'Setup body tag style',
        category: 'Styleguide',
        status: 'pending',
        verificationType: 'manual',
        description: 'Font-family should be set for Paragraphs on the Body tag.'
    },
    {
        id: 'styleguide-headings',
        label: 'Heading Tags (H1-H6)',
        category: 'Styleguide',
        status: 'pending',
        verificationType: 'manual',
        subItems: [
            { id: 'h1-h6-tags', label: 'H1-H6 HTML Tags', category: 'Styleguide', status: 'pending', verificationType: 'manual' },
            { id: 'heading-classes', label: 'heading-style-h1 to h6 classes', category: 'Styleguide', status: 'pending', verificationType: 'manual' }
        ]
    },
    {
        id: 'styleguide-paragraphs',
        label: 'Paragraph Tags',
        category: 'Styleguide',
        status: 'pending',
        verificationType: 'manual',
        subItems: [
            { id: 'all-paragraphs', label: 'Style All Paragraphs', category: 'Styleguide', status: 'pending', verificationType: 'manual' },
            { id: 'text-sizes', label: 'Style Text Sizes (large, medium, etc)', category: 'Styleguide', status: 'pending', verificationType: 'manual' }
        ]
    },
    {
        id: 'color-variables',
        label: 'Setup Color Variables',
        category: 'Variables',
        status: 'pending',
        verificationType: 'manual',
        description: 'Define global color variables as per Client-First guidelines.'
    }
];

interface QAWidgetProps {
    stagingUrl?: string; // URL to scan, passed from parent config
}

export function QAWidget({ stagingUrl }: QAWidgetProps) {
    const [checklist, setChecklist] = useState<QAChecklistItem[]>(INITIAL_CHECKLIST);

    const handleToggle = (id: string, checked: boolean) => {
        setChecklist(prev => updateItemStatus(prev, id, checked ? 'manual-verified' : 'pending'));
    };

    // Helper to recursively update status
    const updateItemStatus = (items: QAChecklistItem[], id: string, status: QAChecklistItem['status'], error?: string, issues?: string[], data?: any): QAChecklistItem[] => {
        return items.map(item => {
            if (item.id === id) {
                return { ...item, status, error, issues, data };
            }
            if (item.subItems) {
                return { ...item, subItems: updateItemStatus(item.subItems, id, status, error, issues, data) };
            }
            return item;
        });
    };

    const handleRunCheck = async (id: string) => {
        if (!stagingUrl) {
            setChecklist(prev => updateItemStatus(prev, id, 'failed', 'No staging URL configured.'));
            return;
        }

        const itemToRun = findItem(checklist, id);
        if (!itemToRun || !itemToRun.verificationEndpoint) return;

        setChecklist(prev => updateItemStatus(prev, id, 'loading', undefined));

        try {
            const response = await fetch(`${itemToRun.verificationEndpoint}?url=${encodeURIComponent(stagingUrl)}`);
            const result: QAScanResult = await response.json();

            // Store full result data (like fontsFound) regardless of pass/fail
            if (result.success && result.passed) {
                setChecklist(prev => updateItemStatus(prev, id, 'passed', undefined, undefined, result));
            } else {
                setChecklist(prev => updateItemStatus(prev, id, 'failed', result.details || 'Check failed', result.issues, result));
            }

        } catch (error) {
            setChecklist(prev => updateItemStatus(prev, id, 'failed', 'System error during check'));
            console.error('QA Check Error:', error);
        }
    };

    // Helper to find item recursively
    const findItem = (items: QAChecklistItem[], id: string): QAChecklistItem | undefined => {
        for (const item of items) {
            if (item.id === id) return item;
            if (item.subItems) {
                const found = findItem(item.subItems, id);
                if (found) return found;
            }
        }
        return undefined;
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-4">
            <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight">Designer Defaults QA</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                    Verify that the project adheres to standard quality guidelines.
                </p>
                {stagingUrl && (
                    <div className="mt-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded inline-block">
                        Scanning: {stagingUrl}
                    </div>
                )}
            </div>

            <QAChecklist
                items={checklist}
                onToggle={handleToggle}
                onRunCheck={handleRunCheck}
            />
        </div>
    );
}
