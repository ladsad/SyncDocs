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

  if (!editor) {
    return (
      <div className="p-8 text-center text-slate-400">Loading editor...</div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden flex flex-col">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
