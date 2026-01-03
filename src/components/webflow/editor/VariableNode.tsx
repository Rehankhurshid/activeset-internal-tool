import { DecoratorNode, SerializedLexicalNode, NodeKey, Spread, EditorConfig, LexicalEditor } from 'lexical';
import { ReactNode } from 'react';

export type SerializedVariableNode = Spread<
    {
        name: string;
        slug: string;
        type: 'variable';
        version: 1;
    },
    SerializedLexicalNode
>;

export class VariableNode extends DecoratorNode<ReactNode> {
    __name: string;
    __slug: string;

    static getType(): string {
        return 'variable';
    }

    static clone(node: VariableNode): VariableNode {
        return new VariableNode(node.__name, node.__slug, node.__key);
    }

    static importJSON(serializedNode: SerializedVariableNode): VariableNode {
        const node = $createVariableNode(serializedNode.name, serializedNode.slug);
        return node;
    }

    constructor(name: string, slug: string, key?: NodeKey) {
        super(key);
        this.__name = name;
        this.__slug = slug;
    }

    exportJSON(): SerializedVariableNode {
        return {
            name: this.__name,
            slug: this.__slug,
            type: 'variable',
            version: 1,
        };
    }

    createDOM(_config: EditorConfig): HTMLElement {
        const span = document.createElement('span');
        span.className = 'inline-block align-middle mx-0.5';
        return span;
    }

    updateDOM(_prevNode: VariableNode, _dom: HTMLElement): boolean {
        return false;
    }

    decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode {
        return (
            <span className="inline-flex items-center rounded-md bg-purple-600 px-2 py-0.5 text-xs font-medium text-white ring-1 ring-inset ring-purple-600/10 cursor-alias select-none h-6">
                {this.__name}
            </span>
        );
    }

    getTextContent(): string {
        return `{{${this.__slug}}}`;
    }
}

export function $createVariableNode(name: string, slug: string): VariableNode {
    return new VariableNode(name, slug);
}

export function $isVariableNode(node: any): node is VariableNode {
    return node instanceof VariableNode;
}
