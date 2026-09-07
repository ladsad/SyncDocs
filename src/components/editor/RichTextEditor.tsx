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
            color: "#2563eb",
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
            "prose max-w-none focus:outline-none min-h-[500px] p-6 text-slate-800",
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
      <div className="p-8 text-center text-slate-400">Loading editor...</div>
    );
  }

  const text = editor.getText();
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden flex flex-col">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span>
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </span>
          <span className="text-slate-300">•</span>
          <span>
            {charCount} {charCount === 1 ? "character" : "characters"}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-slate-400">
          <span>
            Press{" "}
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[11px] font-mono text-slate-600 shadow-2xs">
              Ctrl+S
            </kbd>{" "}
            to save immediately
          </span>
        </div>
      </div>
    </div>
  );
}
