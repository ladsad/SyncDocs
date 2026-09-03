import { EncryptedPayload } from "./crypto";

export type DocumentContentType = "rich_text" | "markdown" | "latex" | "typst";

export interface Document {
  id: string;
  title: string;
  content_type: DocumentContentType;
  content: any; // Plaintext JSON in Phase 0/1 or client-decrypted representation
  yjs_state?: string | null; // Base64 encoded binary Yjs update snapshot
  is_encrypted?: boolean;
  encrypted_title?: EncryptedPayload | null;
  encrypted_content?: EncryptedPayload | null;
  encrypted_yjs_state?: EncryptedPayload | null;
  created_at: string;
  updated_at: string;
}

export interface StoredDocumentRow {
  id: string;
  title?: string;
  content_type: DocumentContentType;
  content?: any;
  yjs_state?: string | null;
  is_encrypted?: boolean;
  encrypted_title?: EncryptedPayload | null;
  encrypted_content?: EncryptedPayload | null;
  encrypted_yjs_state?: EncryptedPayload | null;
  created_at: string;
  updated_at: string;
}

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";
