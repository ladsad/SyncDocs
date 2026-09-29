"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { marked } from "marked";
import katex from "katex";
import { EditorView } from "@codemirror/view";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  SquareCode,
  Link as LinkIcon,
  Table as TableIcon,
  Sigma,
  Columns,
  Eye,
  FileCode,
} from "lucide-react";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { SupabaseYjsProvider } from "@/lib/sync/supabase-provider";

interface MarkdownEditorSurfaceProps {
  initialContent: string;
  onChange: (content: string) => void;
  provider?: SupabaseYjsProvider | null;
  userPresence?: {
    name: string;
    color: string;
  };
  editable?: boolean;
}

type ViewMode = "split" | "editor" | "preview";

// Client-side zero-knowledge Markdown + KaTeX parser
function renderMarkdownWithMath(mdText: string): string {
  if (!mdText) return "";

  const mathBlocks: { id: string; html: string }[] = [];
  let placeholderCount = 0;

  // Protect block math $$...$$
  let text = mdText.replace(/\$\$([\s\S]*?)\$\$/g, (match, mathContent) => {
    const id = `___MATH_BLOCK_${placeholderCount++}___`;
    try {
      const rendered = katex.renderToString(mathContent.trim(), {
        displayMode: true,
        throwOnError: false,
      });
      mathBlocks.push({ id, html: rendered });
    } catch {
      mathBlocks.push({ id, html: match });
    }
    return id;
  });

  // Protect inline math $...$
  text = text.replace(/(^|[^\\])\$([^\$\n]+?)\$/g, (match, prefix, mathContent) => {
    const id = `___MATH_INLINE_${placeholderCount++}___`;
    try {
      const rendered = katex.renderToString(mathContent.trim(), {
        displayMode: false,
        throwOnError: false,
      });
      mathBlocks.push({ id, html: rendered });
    } catch {
      mathBlocks.push({ id, html: match });
    }
    return prefix + id;
  });

  // Parse GFM Markdown
  let html = marked.parse(text, { gfm: true, breaks: true }) as string;

  // Restore KaTeX HTML math blocks
  for (const item of mathBlocks) {
    html = html.replace(item.id, item.html);
  }

  return html;
}

export function MarkdownEditorSurface({
  initialContent,
  onChange,
  provider,
  userPresence,
  editable = true,
}: MarkdownEditorSurfaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [content, setContent] = useState<string>(initialContent || "");
  const editorViewRef = useRef<EditorView | null>(null);

  // Parse rendered HTML whenever markdown content changes
  const renderedHtml = useMemo(() => {
    return renderMarkdownWithMath(content);
  }, [content]);

  // Word & character metrics
  const metrics = useMemo(() => {
    const trimmed = content.trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const chars = content.length;
    return { words, chars };
  }, [content]);

  const handleEditorChange = (newText: string) => {
    setContent(newText);
    onChange(newText);
  };

  // Helper to wrap selected text with syntax
  const insertSyntax = (before: string, after: string = "") => {
    const view = editorViewRef.current;
    if (!view || !editable) return;

    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    const replacement = `${before}${selectedText || "text"}${after}`;

    view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: replacement,
      },
      selection: {
        anchor: selection.from + before.length,
        head: selection.from + before.length + (selectedText.length || 4),
      },
    });
    view.focus();
  };

  // Helper to prefix lines with syntax
  const insertLinePrefix = (prefix: string) => {
    const view = editorViewRef.current;
    if (!view || !editable) return;

    const selection = view.state.selection.main;
    const line = view.state.doc.lineAt(selection.from);

    view.dispatch({
      changes: {
        from: line.from,
        to: line.from,
        insert: prefix,
      },
      selection: {
        anchor: selection.from + prefix.length,
      },
    });
    view.focus();
  };

  const insertTable = () => {
    const tableTemplate = `\n| Column 1 | Column 2 | Column 3 |\n| :--- | :--- | :--- |\n| Item 1 | Item 2 | Item 3 |\n| Item 4 | Item 5 | Item 6 |\n\n`;
    insertSyntax(tableTemplate);
  };

  const btnClass =
    "p-1.5 rounded-xs transition-colors text-xs flex items-center justify-center border border-transparent text-ink-secondary hover:bg-canvas-subtle hover:text-ink hover:border-border";

  return (
    <div className="space-y-4">
      {/* Markdown Surface Toolbar */}
      <div className="bg-canvas-surface border border-border rounded-xs p-1.5 flex flex-wrap items-center justify-between gap-2 sticky top-[57px] z-10">
        {/* Left: Quick Formatting Actions */}
        <div className="flex flex-wrap items-center gap-0.5">
          <button
            type="button"
            onClick={() => insertSyntax("**", "**")}
            disabled={!editable}
            className={btnClass}
            title="Bold (**text**)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSyntax("*", "*")}
            disabled={!editable}
            className={btnClass}
            title="Italic (*text*)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSyntax("~~", "~~")}
            disabled={!editable}
            className={btnClass}
            title="Strikethrough (~~text~~)"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            type="button"
            onClick={() => insertLinePrefix("# ")}
            disabled={!editable}
            className={btnClass}
            title="Heading 1 (#)"
          >
            <Heading1 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix("## ")}
            disabled={!editable}
            className={btnClass}
            title="Heading 2 (##)"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix("### ")}
            disabled={!editable}
            className={btnClass}
            title="Heading 3 (###)"
          >
            <Heading3 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            type="button"
            onClick={() => insertLinePrefix("- ")}
            disabled={!editable}
            className={btnClass}
            title="Unordered List (-)"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix("1. ")}
            disabled={!editable}
            className={btnClass}
            title="Ordered List (1.)"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix("- [ ] ")}
            disabled={!editable}
            className={btnClass}
            title="Task List (- [ ])"
          >
            <ListTodo className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix("> ")}
            disabled={!editable}
            className={btnClass}
            title="Blockquote (>)"
          >
            <Quote className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            type="button"
            onClick={() => insertSyntax("`", "`")}
            disabled={!editable}
            className={btnClass}
            title="Inline Code (`)"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSyntax("```\n", "\n```")}
            disabled={!editable}
            className={btnClass}
            title="Code Block (```)"
          >
            <SquareCode className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSyntax("[", "](https://)")}
            disabled={!editable}
            className={btnClass}
            title="Link [title](url)"
          >
            <LinkIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={insertTable}
            disabled={!editable}
            className={btnClass}
            title="Insert Table"
          >
            <TableIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertSyntax("$", "$")}
            disabled={!editable}
            className={btnClass}
            title="Inline Math ($formula$)"
          >
            <Sigma className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Metrics & View Mode Switcher */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] text-ink-muted border-r border-border pr-3">
            <span>{metrics.words} WORDS</span>
            <span>/</span>
            <span>{metrics.chars} CHARS</span>
          </div>

          <div className="flex items-center border border-border rounded-xs bg-canvas-subtle p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={`px-2 py-0.5 font-mono text-[10px] rounded-xs flex items-center gap-1 transition-colors ${
                viewMode === "split"
                  ? "bg-canvas-DEFAULT text-ink font-bold border border-border"
                  : "text-ink-secondary hover:text-ink border border-transparent"
              }`}
              title="Split View"
            >
              <Columns className="w-3 h-3" />
              <span className="hidden md:inline">SPLIT</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("editor")}
              className={`px-2 py-0.5 font-mono text-[10px] rounded-xs flex items-center gap-1 transition-colors ${
                viewMode === "editor"
                  ? "bg-canvas-DEFAULT text-ink font-bold border border-border"
                  : "text-ink-secondary hover:text-ink border border-transparent"
              }`}
              title="Editor Only"
            >
              <FileCode className="w-3 h-3" />
              <span className="hidden md:inline">EDITOR</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`px-2 py-0.5 font-mono text-[10px] rounded-xs flex items-center gap-1 transition-colors ${
                viewMode === "preview"
                  ? "bg-canvas-DEFAULT text-ink font-bold border border-border"
                  : "text-ink-secondary hover:text-ink border border-transparent"
              }`}
              title="Preview Only"
            >
              <Eye className="w-3 h-3" />
              <span className="hidden md:inline">PREVIEW</span>
            </button>
          </div>
        </div>
      </div>

      {/* Surface Panes */}
      <div
        className={`w-full ${
          viewMode === "split"
            ? "grid grid-cols-1 lg:grid-cols-2 gap-4 items-start"
            : "block"
        }`}
      >
        {/* Left Pane: CodeMirror Editor */}
        {(viewMode === "split" || viewMode === "editor") && (
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center justify-between font-mono text-[10px] text-ink-muted px-1">
              <span>01 / SOURCE (CODEMIRROR 6)</span>
              <span>SYNTAX: GFM / KATEX</span>
            </div>
            <CodeMirrorEditor
              initialContent={initialContent}
              contentType="markdown"
              onChange={handleEditorChange}
              provider={provider}
              userPresence={userPresence}
              editable={editable}
              minHeight="620px"
              onEditorReady={(view) => {
                editorViewRef.current = view;
              }}
            />
          </div>
        )}

        {/* Right Pane: Live HTML + KaTeX Preview */}
        {(viewMode === "split" || viewMode === "preview") && (
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center justify-between font-mono text-[10px] text-ink-muted px-1">
              <span>02 / LIVE PREVIEW</span>
              <span>CLIENT-SIDE PARSED</span>
            </div>
            <div className="border border-border rounded-xs bg-canvas-surface p-6 sm:p-8 min-h-[620px] overflow-auto">
              {renderedHtml ? (
                <article
                  className="markdown-preview"
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              ) : (
                <div className="text-center py-20 text-ink-muted font-mono text-xs">
                  EMPTY MARKDOWN DOCUMENT — START TYPING TO PREVIEW
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
