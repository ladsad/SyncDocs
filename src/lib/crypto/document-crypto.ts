import {
  Document,
  DocumentCollaborator,
  DocumentInvitation,
  DocumentRole,
  StoredDocumentRow,
} from "@/types/document";
import { encryptString, decryptString, encryptJson, decryptJson } from "./cipher";
import { importPublicKey, wrapDocumentKeyForUser, exportRawKey, importRawDocumentKey } from "./keys";
import { arrayBufferToBase64, base64ToArrayBuffer } from "./encoding";
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
 * Shares an encrypted document with another user:
 * - If the user exists in `users`: wraps the Document Key with their ECDH public key.
 * - If the user is NEW/unregistered: generates a zero-knowledge pending invite with an ephemeral key.
 */
export async function shareDocumentWithEmail(
  documentId: string,
  email: string,
  role: DocumentRole = "editor"
): Promise<{
  success: boolean;
  collaborator?: DocumentCollaborator;
  invitation?: DocumentInvitation;
  isPendingInvite?: boolean;
  inviteUrl?: string;
  error?: string;
}> {
  const normalizedEmail = email.trim().toLowerCase();
  const dk = await cryptoVault.getLocalFallbackDocumentKey(documentId);

  if (supabase) {
    // 1. Check if user exists in Supabase
    const { data: userData } = await supabase
      .from("users")
      .select("id, email, public_key")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (userData) {
      // Existing User: perform ECDH key-wrapping
      try {
        const recipientPubKey = await importPublicKey(userData.public_key);
        const wrappedRecord = await wrapDocumentKeyForUser(
          dk,
          recipientPubKey,
          documentId,
          userData.id
        );

        await supabase.from("document_keys").upsert({
          document_id: documentId,
          user_id: userData.id,
          wrapped_dk: wrappedRecord.wrappedDk,
          iv: wrappedRecord.iv,
          ephemeral_public_key: wrappedRecord.ephemeralPublicKey,
        });

        await supabase.from("permissions").upsert({
          document_id: documentId,
          user_id: userData.id,
          role: role,
          updated_at: new Date().toISOString(),
        });

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
        return { success: false, error: err.message || "Failed to wrap document key" };
      }
    } else {
      // Unregistered User: Create zero-knowledge pending invitation
      try {
        const rawInviteKey = window.crypto.getRandomValues(new Uint8Array(32));
        const rawInviteKeyBase64 = arrayBufferToBase64(rawInviteKey);
        const inviteCryptoKey = await window.crypto.subtle.importKey(
          "raw",
          rawInviteKey as unknown as BufferSource,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );

        const rawDk = await exportRawKey(dk);
        const encryptedDk = await encryptString(rawDk, inviteCryptoKey);
        const inviteToken = crypto.randomUUID();

        const { data: insertData, error: inviteErr } = await supabase
          .from("document_invitations")
          .insert({
            document_id: documentId,
            email: normalizedEmail,
            role,
            wrapped_dk: encryptedDk.ciphertext,
            iv: encryptedDk.iv,
            invite_token: inviteToken,
            invited_by: cryptoVault.getUserId() || null,
          })
          .select()
          .single();

        if (inviteErr) throw inviteErr;

        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const inviteUrl = `${origin}/documents/${documentId}?invite=${inviteToken}#inviteKey=${encodeURIComponent(
          rawInviteKeyBase64
        )}`;

        return {
          success: true,
          isPendingInvite: true,
          inviteUrl,
          invitation: {
            id: insertData.id,
            document_id: documentId,
            email: normalizedEmail,
            role,
            invite_token: inviteToken,
            invite_url: inviteUrl,
            expires_at: insertData.expires_at,
            created_at: insertData.created_at,
          },
        };
      } catch (err: any) {
        return { success: false, error: err.message || "Failed to create pending invite" };
      }
    }
  }

  // Local storage fallback for development / offline
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
 * Fetches pending invitations for a document.
 */
export async function fetchDocumentInvitations(
  documentId: string
): Promise<DocumentInvitation[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("document_invitations")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      return data.map((item: any) => ({
        id: item.id,
        document_id: item.document_id,
        email: item.email,
        role: item.role as DocumentRole,
        invite_token: item.invite_token,
        invite_url: `${origin}/documents/${documentId}?invite=${item.invite_token}`,
        expires_at: item.expires_at,
        created_at: item.created_at,
      }));
    }
  }
  return [];
}

/**
 * Revokes a pending invitation.
 */
export async function revokeDocumentInvitation(
  documentId: string,
  inviteId: string
): Promise<boolean> {
  if (supabase) {
    const { error } = await supabase
      .from("document_invitations")
      .delete()
      .eq("document_id", documentId)
      .eq("id", inviteId);
    return !error;
  }
  return true;
}

/**
 * Redeems an invite token when a user opens the invite link.
 */
export async function redeemDocumentInvitation(
  inviteToken: string,
  inviteKeyBase64: string
): Promise<{ success: boolean; documentId?: string; role?: DocumentRole; error?: string }> {
  if (!supabase) {
    return { success: false, error: "Supabase connection required for invite redemption" };
  }

  try {
    const { data: invite, error: inviteErr } = await supabase
      .from("document_invitations")
      .select("*")
      .eq("invite_token", inviteToken)
      .single();

    if (inviteErr || !invite) {
      return { success: false, error: "Invitation not found or has expired." };
    }

    // 1. Decrypt Document Key using ephemeral invite key from hash
    const rawInviteBytes = base64ToArrayBuffer(inviteKeyBase64);
    const inviteCryptoKey = await window.crypto.subtle.importKey(
      "raw",
      rawInviteBytes as unknown as BufferSource,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const decryptedDkRaw = await decryptString(
      { ciphertext: invite.wrapped_dk, iv: invite.iv },
      inviteCryptoKey
    );

    const dk = await importRawDocumentKey(decryptedDkRaw);
    cryptoVault.setDocumentKey(invite.document_id, dk);
    if (typeof window !== "undefined") {
      localStorage.setItem(`syncdocs_dk_${invite.document_id}`, decryptedDkRaw);
    }

    // 2. Initialize current user session with invited email if needed
    const userSession = await cryptoVault.initializeUserSession(invite.email);

    // 3. Register user in permissions and wrap permanent DK
    const userPubKey = await importPublicKey(userSession.publicKey);
    const wrappedRecord = await wrapDocumentKeyForUser(
      dk,
      userPubKey,
      invite.document_id,
      userSession.userId
    );

    await supabase.from("document_keys").upsert({
      document_id: invite.document_id,
      user_id: userSession.userId,
      wrapped_dk: wrappedRecord.wrappedDk,
      iv: wrappedRecord.iv,
      ephemeral_public_key: wrappedRecord.ephemeralPublicKey,
    });

    await supabase.from("permissions").upsert({
      document_id: invite.document_id,
      user_id: userSession.userId,
      role: invite.role,
      updated_at: new Date().toISOString(),
    });

    // 4. Clean up the used invitation
    await supabase.from("document_invitations").delete().eq("id", invite.id);

    return {
      success: true,
      documentId: invite.document_id,
      role: invite.role,
    };
  } catch (err: any) {
    console.error("Failed to redeem invitation:", err);
    return { success: false, error: err.message || "Failed to redeem invitation" };
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


