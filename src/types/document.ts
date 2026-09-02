export type DocumentContentType = "rich_text" | "markdown" | "latex" | "typst";

export interface Document {
  id: string;
  title: string;
  content_type: DocumentContentType;
  content: any; // JSON for Tiptap doc, or string for plain text/latex
  created_at: string;
  updated_at: string;
}

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";
