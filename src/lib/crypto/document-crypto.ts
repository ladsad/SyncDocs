import { Document, StoredDocumentRow } from "@/types/document";
import { encryptString, decryptString, encryptJson, decryptJson } from "./cipher";

export async function encryptDocumentPayload(
  payload: { title: string; content: any; yjs_state?: string | null },
  documentKey: CryptoKey
) {
  const encryptedTitle = await encryptString(payload.title, documentKey);
  const encryptedContent = await encryptJson(payload.content, documentKey);
  const encryptedYjsState = payload.yjs_state
    ? await encryptString(payload.yjs_state, documentKey)
    : null;

  return {
    is_encrypted: true,
    title: "Encrypted Document", // Masked placeholder on server
    content: { type: "doc", content: [] }, // Masked placeholder on server
    encrypted_title: encryptedTitle,
    encrypted_content: encryptedContent,
    encrypted_yjs_state: encryptedYjsState,
  };
}

export async function decryptDocumentRow(
  row: StoredDocumentRow,
  documentKey: CryptoKey | null
): Promise<Document> {
  if (!row.is_encrypted || !documentKey) {
    return {
      id: row.id,
      title: row.title || "Untitled Document",
      content_type: row.content_type,
      content: row.content,
      yjs_state: row.yjs_state,
      is_encrypted: row.is_encrypted || false,
      encrypted_title: row.encrypted_title,
      encrypted_content: row.encrypted_content,
      encrypted_yjs_state: row.encrypted_yjs_state,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  try {
    let title = row.title || "Untitled Document";
    if (row.encrypted_title) {
      title = await decryptString(row.encrypted_title, documentKey);
    }

    let content = row.content;
    if (row.encrypted_content) {
      content = await decryptJson(row.encrypted_content, documentKey);
    }

    let yjs_state = row.yjs_state;
    if (row.encrypted_yjs_state) {
      yjs_state = await decryptString(row.encrypted_yjs_state, documentKey);
    }

    return {
      id: row.id,
      title,
      content_type: row.content_type,
      content,
      yjs_state,
      is_encrypted: true,
      encrypted_title: row.encrypted_title,
      encrypted_content: row.encrypted_content,
      encrypted_yjs_state: row.encrypted_yjs_state,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } catch (err) {
    console.error("Failed to decrypt document row:", err);
    return {
      id: row.id,
      title: "🔒 Locked / Decryption Failed",
      content_type: row.content_type,
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Unable to decrypt document content with current key." }] }] },
      yjs_state: null,
      is_encrypted: true,
      encrypted_title: row.encrypted_title,
      encrypted_content: row.encrypted_content,
      encrypted_yjs_state: row.encrypted_yjs_state,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
