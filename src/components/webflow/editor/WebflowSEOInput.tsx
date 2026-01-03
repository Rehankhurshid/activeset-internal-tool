'use client';

import { useEffect, useRef, useState } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode, $createTextNode, COMMAND_PRIORITY_EDITOR, createCommand, LexicalCommand, $getSelection, $isRangeSelection, TextNode } from 'lexical';
import { VariableNode, $createVariableNode, $isVariableNode } from './VariableNode';

import { cn } from '@/lib/utils';
import { CollectionField } from '@/types/webflow';
import { Zap } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

// Command to insert a variable
export const INSERT_VARIABLE_COMMAND: LexicalCommand<{ name: string; slug: string }> = createCommand(
    'INSERT_VARIABLE_COMMAND',
);

function VariablePlugin() {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return editor.registerCommand(
            INSERT_VARIABLE_COMMAND,
            ({ name, slug }) => {
                editor.update(() => {
                    const selection = $getSelection();
                    if ($isRangeSelection(selection)) {
                        const variableNode = $createVariableNode(name, slug);
                        selection.insertNodes([variableNode]);
                        // Insert a space after to make typing easier
                        selection.insertNodes([$createTextNode(' ')]);
                    }
                });
                return true;
            },
            COMMAND_PRIORITY_EDITOR,
        );
    }, [editor]);

    return null;
}

// Plugin to sync external value changes to the editor (for initial load)
function UpdateStatePlugin({ value, fields }: { value: string; fields: CollectionField[] }) {
    const [editor] = useLexicalComposerContext();
    const isMounted = useRef(false);

    useEffect(() => {
        editor.update(() => {
            const root = $getRoot();
            const currentContent = root.getTextContent();

            // Only update if the value differs from current content to avoid cursor resets on typing
            if (currentContent === value) return;

            // Reset and repopulate
            root.clear();

            if (!value) return; // Handle empty value

            const paragraph = $createParagraphNode();

            // Split by {{variable}} pattern
            const parts = value.split(/(\{\{[^}]+\}\})/g);

            parts.forEach(part => {
                if (part.startsWith('{{') && part.endsWith('}}')) {
                    const slug = part.slice(2, -2);
                    const field = fields.find(f => f.slug === slug);
                    if (field) {
                        paragraph.append($createVariableNode(field.displayName, field.slug));
                    } else {
                        // Fallback: Create a variable node even if not found in list, leveraging slug as name
                        paragraph.append($createVariableNode(slug, slug));
                    }
                } else if (part) {
                    paragraph.append($createTextNode(part));
                }
            });

            root.append(paragraph);
        });
    }, [editor, value, fields]);

    return null;
}


interface WebflowSEOInputProps {
    value: string;
    onChange: (value: string) => void;
    fields: CollectionField[];
    placeholder?: string;
    className?: string;
    multiline?: boolean;
}

export const WebflowSEOInput = ({ value, onChange, fields, placeholder, className, multiline = false }: WebflowSEOInputProps) => {
    const initialConfig = {
        namespace: 'SEOInput',
        theme: {
            paragraph: 'm-0',
        },
        onError: (e: Error) => console.error(e),
        nodes: [VariableNode],
    };

    const handleEditorChange = (editorState: any) => {
        editorState.read(() => {
            const root = $getRoot();
            const textContent = root.getTextContent();
            // getTextContent on VariableNode returns {{slug}}, so this matches our desired output format!
            onChange(textContent);
        });
    };

    // Helper to trigger insert command from outside
    const editorRef = useRef<any>(null);

    const handleInsertVariable = (field: CollectionField) => {
        if (editorRef.current) {
            editorRef.current.dispatchCommand(INSERT_VARIABLE_COMMAND, { name: field.displayName, slug: field.slug });
        }
    };

    return (
        <div className={cn("relative group", className)}>
            <LexicalComposer initialConfig={initialConfig}>
                <div className={cn(
                    "flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                    multiline ? "h-auto" : "h-10 items-center overflow-hidden"
                )}>
                    <PlainTextPlugin
                        contentEditable={<ContentEditable className="outline-none w-full min-w-0" />}
                        placeholder={<div className="text-muted-foreground absolute pointer-events-none select-none top-2">{placeholder}</div>}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin />
                    <VariablePlugin />
                    {/* We only run UpdateStatePlugin once on mount/init with initial value */}
                    <UpdateStatePlugin value={value} fields={fields} />

                    <OnChangePlugin onChange={handleEditorChange} />
                    <CaptureEditorRef ref={editorRef} />
                </div>

                {/* Floating Action Button for Variables - Positioned absolutely within the input or outside? 
            Let's keep it clean: A small button inside the input on the right, or just outside.
            The user mockup showed a dropdown triggered from text, but also a menu.
            Let's put a small trigger icon inside the input on the right.
        */}
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-purple-600">
                                <Zap className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[200px] max-h-[300px] overflow-y-auto">
                            {fields.map(field => (
                                <DropdownMenuItem key={field.id} onClick={() => handleInsertVariable(field)}>
                                    {field.displayName}
                                    <span className="ml-auto text-xs text-muted-foreground mono">{field.slug}</span>
                                </DropdownMenuItem>
                            ))}
                            {fields.length === 0 && <div className="p-2 text-xs text-muted-foreground">No fields available</div>}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </LexicalComposer>
        </div>
    );
};

// Helper component to expose editor instance
function CaptureEditorRef({ ref }: { ref: any }) {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        if (ref) ref.current = editor;
    }, [editor, ref]);
    return null;
}
