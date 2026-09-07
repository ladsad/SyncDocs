import {
  Document,
  DocumentCollaborator,
  DocumentRole,
  StoredDocumentRow,
} from "@/types/document";
import { encryptString, decryptString, encryptJson, decryptJson } from "./cipher";
import { importPublicKey, wrapDocumentKeyForUser } from "./keys";
import { cryptoVault } from "./vault";
import { supabase } from "../supabase";

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
      owner_id: row.owner_id,
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
      owner_id: row.owner_id,
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
      owner_id: row.owner_id,
      title: "🔒 Locked / Decryption Failed",
      content_type: row.content_type,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Unable to decrypt document content with current key.",
              },
            ],
          },
        ],
      },
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

/**
 * Shares an encrypted document with another user by wrapping the Document Key (DK)
 * using the invitee's public key (ECDH P-256) and inserting document_keys & permissions records.
 */
export async function shareDocumentWithEmail(
  documentId: string,
  email: string,
  role: DocumentRole = "editor"
): Promise<{ success: boolean; collaborator?: DocumentCollaborator; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const dk = await cryptoVault.getLocalFallbackDocumentKey(documentId);

  if (supabase) {
    // 1. Lookup user's public key by email
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, email, public_key")
      .eq("email", normalizedEmail)
      .single();

    if (userError || !userData) {
      return {
        success: false,
        error: `User "${normalizedEmail}" not found. They must sign in once to register their public key, or you can share a direct key link.`,
      };
    }

    try {
      // 2. Wrap Document Key for recipient
      const recipientPubKey = await importPublicKey(userData.public_key);
      const wrappedRecord = await wrapDocumentKeyForUser(
        dk,
        recipientPubKey,
        documentId,
        userData.id
      );

      // 3. Upsert into document_keys
      const { error: keyError } = await supabase.from("document_keys").upsert({
        document_id: documentId,
        user_id: userData.id,
        wrapped_dk: wrappedRecord.wrappedDk,
        iv: wrappedRecord.iv,
        ephemeral_public_key: wrappedRecord.ephemeralPublicKey,
      });

      if (keyError) throw keyError;

      // 4. Upsert into permissions
      const { error: permError } = await supabase.from("permissions").upsert({
        document_id: documentId,
        user_id: userData.id,
        role: role,
        updated_at: new Date().toISOString(),
      });

      if (permError) throw permError;

      return {
        success: true,
        collaborator: {
          userId: userData.id,
          email: userData.email,
          role,
          publicKey: userData.public_key,
          joinedAt: new Date().toISOString(),
        },
      };
    } catch (err: any) {
      console.error("Failed to wrap key or write permissions:", err);
      return { success: false, error: err.message || "Failed to share document" };
    }
  }

  // Local storage fallback for development & offline mode
  const localCollabsKey = `syncdocs_collaborators_${documentId}`;
  let collabs: DocumentCollaborator[] = [];
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(localCollabsKey) : null;
    collabs = raw ? JSON.parse(raw) : [];
  } catch {}

  const existing = collabs.find((c) => c.email?.toLowerCase() === normalizedEmail);
  if (existing) {
    existing.role = role;
  } else {
    collabs.push({
      userId: `local-user-${Date.now()}`,
      email: normalizedEmail,
      role,
      joinedAt: new Date().toISOString(),
    });
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(localCollabsKey, JSON.stringify(collabs));
  }

  return {
    success: true,
    collaborator: collabs.find((c) => c.email?.toLowerCase() === normalizedEmail),
  };
}

/**
 * Fetches all active collaborators and their roles on a document.
 */
export async function fetchDocumentCollaborators(
  documentId: string
): Promise<DocumentCollaborator[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("permissions")
      .select("user_id, role, created_at, users(email, public_key)")
      .eq("document_id", documentId);

    if (!error && data) {
      return data.map((item: any) => ({
        userId: item.user_id,
        role: item.role as DocumentRole,
        email: item.users?.email || "Unknown user",
        publicKey: item.users?.public_key,
        joinedAt: item.created_at,
      }));
    }
  }

  const localCollabsKey = `syncdocs_collaborators_${documentId}`;
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(localCollabsKey) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Updates a collaborator's role (owner, editor, viewer).
 */
export async function updateCollaboratorRole(
  documentId: string,
  userId: string,
  role: DocumentRole
): Promise<boolean> {
  if (supabase) {
    const { error } = await supabase
      .from("permissions")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("document_id", documentId)
      .eq("user_id", userId);

    return !error;
  }

  const localCollabsKey = `syncdocs_collaborators_${documentId}`;
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(localCollabsKey) : null;
    let collabs: DocumentCollaborator[] = raw ? JSON.parse(raw) : [];
    const item = collabs.find((c) => c.userId === userId);
    if (item) {
      item.role = role;
      localStorage.setItem(localCollabsKey, JSON.stringify(collabs));
      return true;
    }
  } catch {}
  return false;
}

/**
 * Revokes a collaborator's access by removing their permissions and wrapped document key.
 */
export async function revokeCollaboratorAccess(
  documentId: string,
  userId: string
): Promise<boolean> {
  if (supabase) {
    await supabase
      .from("permissions")
      .delete()
      .eq("document_id", documentId)
      .eq("user_id", userId);

    await supabase
      .from("document_keys")
      .delete()
      .eq("document_id", documentId)
      .eq("user_id", userId);

    return true;
  }

  const localCollabsKey = `syncdocs_collaborators_${documentId}`;
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(localCollabsKey) : null;
    let collabs: DocumentCollaborator[] = raw ? JSON.parse(raw) : [];
    collabs = collabs.filter((c) => c.userId !== userId);
    localStorage.setItem(localCollabsKey, JSON.stringify(collabs));
    return true;
  } catch {}
  return false;
}

