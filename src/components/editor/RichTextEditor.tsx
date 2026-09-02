"use client";

import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorToolbar } from "./EditorToolbar";

interface RichTextEditorProps {
  initialContent: any;
  onChange: (content: any) => void;
  editable?: boolean;
}

export function RichTextEditor({
  initialContent,
  onChange,
  editable = true,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
    ],
    content: initialContent,
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
  });

  // Sync if initialContent changes externally (e.g. initial fetch loads)
  useEffect(() => {
    if (editor && initialContent && !editor.isFocused) {
      const currentJSON = JSON.stringify(editor.getJSON());
      const incomingJSON = JSON.stringify(initialContent);
      if (currentJSON !== incomingJSON) {
        editor.commands.setContent(initialContent, false);
      }
    }
  }, [initialContent, editor]);

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
