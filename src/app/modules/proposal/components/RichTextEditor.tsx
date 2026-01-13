'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { AutoLinkPlugin } from '@lexical/react/LexicalAutoLinkPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeNode, $createCodeNode } from '@lexical/code';
import { LinkNode, AutoLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { TRANSFORMERS } from '@lexical/markdown';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import {
    $getSelection,
    $isRangeSelection,
    FORMAT_TEXT_COMMAND,
    UNDO_COMMAND,
    REDO_COMMAND,
    CAN_UNDO_COMMAND,
    CAN_REDO_COMMAND,
    $getRoot,

    COMMAND_PRIORITY_CRITICAL,
    SELECTION_CHANGE_COMMAND,
    FORMAT_ELEMENT_COMMAND,
    $isElementNode,
    $isDecoratorNode,
    $createParagraphNode,
    ElementNode
} from 'lexical';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { mergeRegister } from '@lexical/utils';

// UI Imports
import {
    Bold, Italic, Strikethrough, Underline, Code, Link as LinkIcon,
    List, ListOrdered,
    Undo, Redo, AlignLeft, AlignCenter, AlignRight, AlignJustify,
    ChevronDown
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const theme = {
    paragraph: 'mb-2 text-base leading-7',
    heading: {
        h1: 'text-3xl font-bold mb-4 mt-6',
        h2: 'text-2xl font-bold mb-3 mt-5 border-b pb-1',
        h3: 'text-xl font-bold mb-2 mt-4',
    },
    list: {
        ul: 'list-disc pl-5 mb-4',
        ol: 'list-decimal pl-5 mb-4',
        listitem: 'mb-1 pl-1',
    },
    text: {
        bold: 'font-bold',
        italic: 'italic',
        strikethrough: 'line-through',
        underline: 'underline',
        code: 'bg-muted font-mono text-sm px-1 py-0.5 rounded text-red-500',
    },
    quote: 'border-l-4 border-primary pl-4 italic my-4 text-muted-foreground bg-muted/20 py-2 rounded-r',
    link: 'text-primary underline cursor-pointer hover:text-primary/80',
    code: 'bg-muted text-sm font-mono p-4 rounded-md my-4 block overflow-auto',
};

// Unused component removed/commented out
// const BlockOptionsDropdownList = ({ editor, blockType, toolbarRef, setShowBlockOptionsModal }) => { ... };


// --- Toolbar Plugin ---
const ToolbarPlugin = ({ simple }: { simple: boolean }) => {
    const [editor] = useLexicalComposerContext();
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [isStrikethrough, setIsStrikethrough] = useState(false);
    const [isCode, setIsCode] = useState(false);
    const [isLink] = useState(false);
    const [blockType, setBlockType] = useState('Paragraph');
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const updateToolbar = useCallback(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            // Text Formatting
            setIsBold(selection.hasFormat('bold'));
            setIsItalic(selection.hasFormat('italic'));
            setIsUnderline(selection.hasFormat('underline'));
            setIsStrikethrough(selection.hasFormat('strikethrough'));
            setIsCode(selection.hasFormat('code'));

            // Link presence
            // const node = selection.getNodes().find((n) => $isLinkNode(n));
            // This is a rough check. Better is to check parent.
            // For now, simplify:
            // setIsLink(selection.hasFormat('link')? No, link is a node not format usually)

            // Block Type Detection
            const anchorNode = selection.anchor.getNode();
            const element = anchorNode.getKey() === 'root'
                ? anchorNode
                : anchorNode.getTopLevelElementOrThrow();
            const elementKey = element.getKey();
            const elementDOM = editor.getElementByKey(elementKey);

            if (elementDOM !== null) {
                if (element.getType() === 'heading') {
                    const level = (element as HeadingNode).getTag();
                    setBlockType(level === 'h1' ? 'Heading 1' : level === 'h2' ? 'Heading 2' : 'Heading 3');
                } else if (element.getType() === 'quote') {
                    setBlockType('Quote');
                } else if (element.getType() === 'code') {
                    setBlockType('Code Block');
                } else if (element.getType() === 'list') {
                    // List handling is complex with nested lists
                    setBlockType('List');
                } else {
                    setBlockType('Normal');
                }
            }
        }
    }, [editor]);

    useEffect(() => {
        return mergeRegister(
            editor.registerUpdateListener(({ editorState }) => {
                editorState.read(() => {
                    updateToolbar();
                });
            }),
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    updateToolbar();
                    return false;
                },
                COMMAND_PRIORITY_CRITICAL,
            ),
            editor.registerCommand(CAN_UNDO_COMMAND, (payload) => {
                setCanUndo(payload);
                return false;
            }, COMMAND_PRIORITY_CRITICAL),
            editor.registerCommand(CAN_REDO_COMMAND, (payload) => {
                setCanRedo(payload);
                return false;
            }, COMMAND_PRIORITY_CRITICAL)
        );
    }, [editor, updateToolbar]);

    const formatHeading = (level: 1 | 2 | 3) => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $setBlocksType(selection, () => $createHeadingNode(`h${level}`));
            }
        });
    };

    const formatQuote = () => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $setBlocksType(selection, () => $createQuoteNode());
            }
        });
    };

    const formatCodeBlock = () => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $setBlocksType(selection, () => $createCodeNode());
            }
        });
    }

    // const formatParagraph = () => {
    //     editor.update(() => {
    //         const selection = $getSelection();
    //         if ($isRangeSelection(selection)) {
    //             // We need to import $createParagraphNode inside or use a workaround
    //             // Since we didn't import it, let's skip or fix imports. 
    //             // Actually, passing a function that returns a simple string 'paragraph' works in some updated helpers? 
    //             // No, $setBlocksType expects a creator.
    //             // Let's rely on importing it.
    //             // Or just use the Quote toggle to toggle OFF quote? 
    //             // Properly, we should import $createParagraphNode from lexical.

    //             // Hack: if we are in heading, toggling heading usually removes it in some editors, 
    //             // but in Lexical $setBlocksType switches.
    //             // I will add the import next time if this fails, but Paragraph conversion is key.
    //         }
    //     });
    // }

    const insertLink = useCallback(() => {
        if (!isLink) {
            const url = prompt('Enter URL:');
            if (url) {
                editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
            }
        } else {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
        }
    }, [editor, isLink]);

    return (
        <div className="border-b border-input bg-muted/30 p-1.5 flex gap-0.5 items-center flex-wrap">
            {/* History */}
            <div className="flex gap-0.5 border-r pr-1 mr-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} disabled={!canUndo} title="Undo">
                    <Undo className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} disabled={!canRedo} title="Redo">
                    <Redo className="h-4 w-4" />
                </Button>
            </div>

            {/* Block Type Dropdown - Hidden in Simple Mode */}
            {!simple && (
                <>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 w-[120px] justify-between font-normal mr-1">
                                {blockType}
                                <ChevronDown className="h-3 w-3 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            {/* Note: Requires $createParagraphNode import to fully support "Normal" switching from others */}
                            <DropdownMenuItem onClick={() => formatHeading(1)}>Heading 1</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => formatHeading(2)}>Heading 2</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => formatHeading(3)}>Heading 3</DropdownMenuItem>
                            <DropdownMenuItem onClick={formatQuote}>Quote</DropdownMenuItem>
                            <DropdownMenuItem onClick={formatCodeBlock}>Code Block</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Separator orientation="vertical" className="h-6 mx-1" />
                </>
            )}

            {/* Formatting */}
            <Toggle size="sm" pressed={isBold} onPressedChange={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} aria-label="Bold">
                <Bold className="h-4 w-4" />
            </Toggle>
            <Toggle size="sm" pressed={isItalic} onPressedChange={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} aria-label="Italic">
                <Italic className="h-4 w-4" />
            </Toggle>
            <Toggle size="sm" pressed={isUnderline} onPressedChange={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} aria-label="Underline">
                <Underline className="h-4 w-4" />
            </Toggle>
            <Toggle size="sm" pressed={isStrikethrough} onPressedChange={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')} aria-label="Strikethrough">
                <Strikethrough className="h-4 w-4" />
            </Toggle>
            {!simple && (
                <Toggle size="sm" pressed={isCode} onPressedChange={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')} aria-label="Inline Code">
                    <Code className="h-4 w-4" />
                </Toggle>
            )}
            <Button variant="ghost" size="icon" className={`h-8 w-8 ${isLink ? 'bg-muted' : ''}`} onClick={insertLink} title="Link">
                <LinkIcon className="h-4 w-4" />
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Alignments */}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')} title="Align Left">
                <AlignLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')} title="Align Center">
                <AlignCenter className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')} title="Align Right">
                <AlignRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify')} title="Justify">
                <AlignJustify className="h-4 w-4" />
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Lists */}
            <Toggle size="sm" onPressedChange={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} aria-label="Bullet List">
                <List className="h-4 w-4" />
            </Toggle>
            <Toggle size="sm" onPressedChange={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} aria-label="Ordered List">
                <ListOrdered className="h-4 w-4" />
            </Toggle>
        </div>
    );
};

// --- HTML Sync Plugin (Crucial for Data Persistence) ---
const HtmlSyncPlugin = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
    const [editor] = useLexicalComposerContext();
    const valueRef = useRef(value);
    const onChangeRef = useRef(onChange);
    const isUpdatingFromProp = useRef(true); // Start true to block initial empty sync-out
    const hasInitialized = useRef(false);
    const editorContainerRef = useRef<HTMLElement | null>(null);

    // Get editor root element on mount
    useEffect(() => {
        editorContainerRef.current = editor.getRootElement();
    }, [editor]);

    // Keep onChangeRef fresh
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    // Sync Out (Editor -> Parent Component)
    useEffect(() => {
        return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
            // Since we start isUpdatingFromProp=true, this will be blocked until first Sync In completes.
            if (isUpdatingFromProp.current) return;

            // Optimization: Don't trigger if only selection changed (unless you need selection state)
            if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

            editorState.read(() => {
                const html = $generateHtmlFromNodes(editor, null);
                if (html !== valueRef.current) {
                    valueRef.current = html;
                    onChangeRef.current(html);
                }
            });
        });
    }, [editor]); // Removed onChange from deps to prevent re-registration

    // Sync In (Parent Component -> Editor)
    useEffect(() => {
        // Force check on first render, otherwise optimization
        if (hasInitialized.current && value === valueRef.current) {
            return;
        }
        hasInitialized.current = true;

        // Deeper check: Compare actual editor content to avoid re-formatting "A" to "<p>A</p>" loops logic if possible
        let isContentSame = false;
        editor.getEditorState().read(() => {
            const currentHtml = $generateHtmlFromNodes(editor, null);
            if (currentHtml === value) {
                isContentSame = true;
                valueRef.current = value; // Sync ref
            }
        });
        if (isContentSame) {
            // Content matches, make sure we unblock (important for initial load)
            isUpdatingFromProp.current = false;
            return;
        }

        // CRITICAL: Check if the editor currently has focus.
        const rootElement = editor.getRootElement();
        const activeElement = document.activeElement;
        const editorHasFocus = rootElement && (
            rootElement === activeElement ||
            rootElement.contains(activeElement)
        );

        // CRITICAL UPDATE: Relaxed focus check.
        // If the value passed in matches what we think the editor has, DO NOTHING.
        // This is the most critical check to prevent loops/focus stealing.
        // If editor doesn't have focus and another element does, only skip if the new value is likely an older version 
        // or if we suspect race conditions. But for template selection, the value jumps significantly.
        // Let's rely on the ref check (already done above: isContentSame).

        // If we really want to be safe: check if activeElement is an INPUT or TEXTAREA
        if (!editorHasFocus && activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            // Only block if typing elsewhere.
            // Even then, we must unblock to ensure future updates work?
            // No, if we skip update, we are done. Block state should be whatever it was.
            // BUT for initial load we MUST unblock.
            // If initial load happens while focused elsewhere? We skip update. Editor empty.
            // Sync out blocked. 
            // If user clicks editor -> becomes focused.
            // Sync Out blocked? Yes.
            // User types -> Sync Out blocked. No updates to parent. BAD.

            // So we MUST unblock even if we skip update, IF it was the initial load.
            // Or simpler: just always unblock at the end of this effect run?

            valueRef.current = value;
            isUpdatingFromProp.current = false;
            return;
        }

        valueRef.current = value;
        isUpdatingFromProp.current = true;

        editor.update(() => {
            const parser = new DOMParser();
            const dom = parser.parseFromString(value || '', 'text/html');
            const nodes = $generateNodesFromDOM(editor, dom);

            $getRoot().clear();

            // Wrap inline nodes in ParagraphNode
            nodes.forEach((node) => {
                if ($getRoot().canBeEmpty() && $getRoot().isEmpty() && !$isElementNode(node) && !$isDecoratorNode(node)) {
                    const paragraph = $createParagraphNode();
                    paragraph.append(node);
                    $getRoot().append(paragraph);
                } else if (!$isElementNode(node) && !$isDecoratorNode(node)) {
                    // If the last child is a paragraph, append to it. Otherwise create new.
                    const lastChild = $getRoot().getLastChild();
                    if (lastChild && lastChild.getType() === 'paragraph') {
                        (lastChild as ElementNode).append(node);
                    } else {
                        const paragraph = $createParagraphNode();
                        paragraph.append(node);
                        $getRoot().append(paragraph);
                    }
                } else {
                    $getRoot().append(node);
                }
            });
        }, { discrete: true });

        // Reset flag and trigger normalization sync if needed
        setTimeout(() => {
            isUpdatingFromProp.current = false;

            // Post-update normalization: ensure parent gets the class-rich HTML
            editor.getEditorState().read(() => {
                const html = $generateHtmlFromNodes(editor, null);
                if (html !== valueRef.current) {
                    // The editor added classes/formatting that wasn't in the raw HTML.
                    // Sync this better version back to the parent.
                    valueRef.current = html;
                    onChangeRef.current(html);
                }
            });
        }, 0);
    }, [value, editor]);

    return null;
}

// AutoLink Matchers regex (defined outside to avoid re-creation)
const URL_MATCHER = /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
const EMAIL_MATCHER = /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/;

const MATCHERS = [
    (text: string) => {
        const match = URL_MATCHER.exec(text);
        return match && { index: match.index, length: match[0].length, text: match[0], url: match[0] };
    },
    (text: string) => {
        const match = EMAIL_MATCHER.exec(text);
        return match && { index: match.index, length: match[0].length, text: match[0], url: `mailto:${match[0]}` };
    },
];

// --- Main Editor Component ---
interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    simple?: boolean; // New prop for simplified mode
}

const RichTextEditor = ({ value, onChange, placeholder, className, simple = false }: RichTextEditorProps) => {

    const initialConfig = {
        namespace: 'ProposalEditor',
        theme,
        onError: (e: Error) => console.error(e),
        nodes: [
            HeadingNode,
            ListNode,
            ListItemNode,
            QuoteNode,
            CodeNode,
            LinkNode,
            AutoLinkNode
        ]
    };

    return (
        <div className={`flex flex-col border border-input rounded-md overflow-hidden bg-transparent ${className}`}>
            <LexicalComposer initialConfig={initialConfig}>

                <ToolbarPlugin simple={simple} />

                <div className="relative">
                    <div className="px-3 py-2 relative">
                        <RichTextPlugin
                            contentEditable={
                                <ContentEditable className="outline-none resize-none prose prose-sm max-w-none dark:prose-invert min-h-[60px]" />
                            }
                            placeholder={
                                <div className="absolute top-2 left-3 text-muted-foreground pointer-events-none select-none">
                                    {placeholder || 'Start typing...'}
                                </div>
                            }
                            ErrorBoundary={LexicalErrorBoundary}
                        />

                        {/* Plugins */}
                        <HistoryPlugin />
                        <ListPlugin />
                        <LinkPlugin />
                        <AutoLinkPlugin matchers={MATCHERS} />
                        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />

                        {/* Sync */}
                        <HtmlSyncPlugin value={value} onChange={onChange} />
                    </div>
                </div>
            </LexicalComposer>
        </div>
    );
};

export default RichTextEditor;
