"use client";

import React, { useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { EditorToolbar } from "./EditorToolbar";
import { SupabaseYjsProvider } from "@/lib/sync/supabase-provider";

interface RichTextEditorProps {
  initialContent: any;
  onChange: (content: any) => void;
  provider?: SupabaseYjsProvider | null;
  userPresence?: {
    name: string;
    color: string;
  };
  editable?: boolean;
}

export function RichTextEditor({
  initialContent,
  onChange,
  provider,
  userPresence,
  editable = true,
}: RichTextEditorProps) {
  const extensions = useMemo(() => {
    if (provider) {
      return [
        StarterKit.configure({
          history: false, // Collaborative history handled by Yjs
          heading: {
            levels: [1, 2, 3],
          },
        }),
        Collaboration.configure({
          document: provider.doc,
        }),
        CollaborationCursor.configure({
          provider: provider,
          user: userPresence || {
            name: "Anonymous",
            color: "#8B9A6E",
          },
        }),
      ];
    }

    return [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
    ];
  }, [provider, userPresence]);

  const editor = useEditor(
    {
      extensions,
      content: provider ? undefined : initialContent,
      editable,
      immediatelyRender: false,
      onUpdate: ({ editor }) => {
        onChange(editor.getJSON());
      },
      editorProps: {
        attributes: {
          class:
            "focus:outline-none min-h-[560px] p-6 sm:p-10 text-ink leading-relaxed font-sans",
        },
      },
    },
    [extensions]
  );

  React.useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  if (!editor) {
    return (
      <div className="p-8 text-center font-mono text-xs text-ink-muted">
        INITIALIZING EDITOR ENGINE...
      </div>
    );
  }

  const text = editor.getText();
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  return (
    <div className="border border-border rounded-xs bg-canvas-surface overflow-hidden flex flex-col">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
      <div className="px-4 py-2 bg-canvas-subtle border-t border-border font-mono text-[11px] text-ink-muted flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span>
            WORDS: {wordCount.toString().padStart(3, "0")}
          </span>
          <span className="text-border-structural">/</span>
          <span>
            CHARS: {charCount.toString().padStart(4, "0")}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-ink-muted">
          <span>
            SHORTCUT:{" "}
            <kbd className="px-1.5 py-0.5 bg-canvas-DEFAULT border border-border rounded-xs text-[10px] font-mono text-ink">
              CTRL+S
            </kbd>{" "}
            TO PERSIST
          </span>
        </div>
      </div>
    </div>
  );
}

