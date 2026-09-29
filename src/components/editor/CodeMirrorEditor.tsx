"use client";

import React, { useEffect, useRef } from "react";
import * as Y from "yjs";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, keymap } from "@codemirror/view";
import { EditorState, Compartment, Extension } from "@codemirror/state";
import { defaultKeymap, indentWithTab, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, syntaxHighlighting, HighlightStyle, StreamLanguage } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { tags as t } from "@lezer/highlight";
import { yCollab } from "y-codemirror.next";
import { DocumentContentType } from "@/types/document";
import { SupabaseYjsProvider } from "@/lib/sync/supabase-provider";

interface CodeMirrorEditorProps {
  initialContent: string;
  contentType: DocumentContentType;
  onChange?: (content: string) => void;
  provider?: SupabaseYjsProvider | null;
  userPresence?: {
    name: string;
    color: string;
  };
  editable?: boolean;
  className?: string;
  minHeight?: string;
  onEditorReady?: (view: EditorView) => void;
}

// Light Technical Brutalism syntax highlighting theme
const brutalistHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#6A7B4F", fontWeight: "bold" },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: "#252822" },
  { tag: [t.function(t.variableName), t.labelName], color: "#4A6332" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#8C582F" },
  { tag: [t.definition(t.name), t.separator], color: "#252822" },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#7B5532" },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#6A7B4F" },
  { tag: [t.meta, t.comment], color: "#8C897F", fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "#4A6332", textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: "#252822" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#9E6436" },
  { tag: [t.processingInstruction, t.string, t.inserted], color: "#4F6838" },
  { tag: t.invalid, color: "#C05646" },
]);

// Light Technical Brutalism editor UI theme
const brutalistTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "#F7F2EB", // canvas
    color: "#252822", // ink
    fontFamily: "var(--font-jetbrains-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)",
    fontSize: "13px",
  },
  ".cm-content": {
    padding: "16px 0",
    caretColor: "#252822",
  },
  ".cm-cursor": {
    borderLeftColor: "#252822",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "#8B9A6E", // sage
  },
  ".cm-line": {
    padding: "0 16px",
    lineHeight: "1.65",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(139, 154, 110, 0.28) !important",
  },
  ".cm-gutters": {
    backgroundColor: "#EAE2D6", // canvas-surface
    color: "#7D7D76", // ink-muted
    borderRight: "1px solid #D6CEC1", // border
    paddingRight: "6px",
    userSelect: "none",
  },
  ".cm-gutterElement": {
    fontFamily: "var(--font-jetbrains-mono, monospace)",
    fontSize: "11px",
    paddingLeft: "8px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#DFD7CA",
    color: "#252822",
    fontWeight: "bold",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(37, 40, 34, 0.035)",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
  },
  ".cm-ySelectionInfo": {
    position: "absolute",
    top: "-1.15em",
    left: "-1px",
    fontSize: "10px",
    fontFamily: "var(--font-jetbrains-mono, monospace)",
    fontWeight: "bold",
    lineHeight: "1",
    padding: "2px 4px",
    borderRadius: "2px",
    color: "#F7F2EB",
    userSelect: "none",
    whiteSpace: "nowrap",
    zIndex: 10,
  },
});

export function CodeMirrorEditor({
  initialContent,
  contentType,
  onChange,
  provider,
  userPresence,
  editable = true,
  className = "",
  minHeight = "400px",
  onEditorReady,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartmentRef = useRef<Compartment>(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    let ytext: Y.Text | null = null;
    let observer: (() => void) | null = null;

    // Determine language support
    const languageExtension: Extension[] = [];
    if (contentType === "markdown") {
      languageExtension.push(markdown());
    } else if (contentType === "latex") {
      languageExtension.push(StreamLanguage.define(stex));
    }

    const extensions: Extension[] = [
      brutalistTheme,
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      dropCursor(),
      bracketMatching(),
      closeBrackets(),
      EditorView.lineWrapping,
      syntaxHighlighting(brutalistHighlightStyle, { fallback: true }),
      editableCompartmentRef.current.of([
        EditorState.readOnly.of(!editable),
        EditorView.editable.of(editable),
      ]),
      ...languageExtension,
    ];

    if (provider) {
      ytext = provider.doc.getText("codemirror");

      // Seed initial content if ytext is brand new and empty
      if (ytext.toString() === "" && typeof initialContent === "string" && initialContent.length > 0) {
        ytext.insert(0, initialContent);
      }

      // Add collaborative binding (handles Yjs undo/redo and remote cursor selections)
      extensions.push(
        yCollab(ytext, provider.awareness),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, indentWithTab])
      );

      // Listen to Yjs text changes and notify parent component
      observer = () => {
        if (ytext && onChangeRef.current) {
          onChangeRef.current(ytext.toString());
        }
      };
      ytext.observe(observer);
    } else {
      // Standalone / fallback mode without real-time provider
      extensions.push(
        history(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChangeRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        })
      );
    }

    const state = EditorState.create({
      doc: provider && ytext ? undefined : initialContent || "",
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    if (onEditorReady) {
      onEditorReady(view);
    }

    return () => {
      if (ytext && observer) {
        ytext.unobserve(observer);
      }
      view.destroy();
      viewRef.current = null;
    };
  }, [provider, contentType]);

  // Dynamically update editable compartment when prop changes
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: editableCompartmentRef.current.reconfigure([
          EditorState.readOnly.of(!editable),
          EditorView.editable.of(editable),
        ]),
      });
    }
  }, [editable]);

  return (
    <div
      ref={containerRef}
      className={`border border-border rounded-xs overflow-hidden bg-canvas ${className}`}
      style={{ minHeight }}
    />
  );
}
