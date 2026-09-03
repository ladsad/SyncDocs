import {
  generateDocumentKey,
  generateUserKeypair,
  deriveMasterKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  wrapDocumentKeyForUser,
  unwrapDocumentKey,
  exportPublicKey,
  exportRawKey,
  importRawDocumentKey,
} from "./keys";
import { UserKeypairExport, DocumentKeyRecord } from "@/types/crypto";
import { arrayBufferToBase64, base64ToArrayBuffer } from "./encoding";

class CryptoVault {
  private userPrivateKey: CryptoKey | null = null;
  private userPublicKey: CryptoKey | null = null;
  private userPublicKeyBase64: string | null = null;
  private documentKeys: Map<string, CryptoKey> = new Map();

  // In-memory or session cache
  public setSessionKeypair(
    privateKey: CryptoKey,
    publicKey: CryptoKey,
    publicKeyBase64: string
  ) {
    this.userPrivateKey = privateKey;
    this.userPublicKey = publicKey;
    this.userPublicKeyBase64 = publicKeyBase64;
  }

  public getUserPrivateKey(): CryptoKey | null {
    return this.userPrivateKey;
  }

  public getUserPublicKeyBase64(): string | null {
    return this.userPublicKeyBase64;
  }

  public setDocumentKey(documentId: string, key: CryptoKey) {
    this.documentKeys.set(documentId, key);
  }

  public getDocumentKey(documentId: string): CryptoKey | null {
    return this.documentKeys.get(documentId) || null;
  }

  /**
   * Initializes or retrieves a Document Key for a document.
   * If not cached, it attempts to unwrap from the provided record or creates a new one.
   */
  public async getOrInitializeDocumentKey(
    documentId: string,
    existingRecord?: { wrappedDk: string; iv: string; ephemeralPublicKey?: string } | null,
    isCreator = false
  ): Promise<CryptoKey> {
    const existing = this.getDocumentKey(documentId);
    if (existing) return existing;

    // 1. If wrapped record exists and we have private key, unwrap it
    if (existingRecord?.wrappedDk && existingRecord?.ephemeralPublicKey && this.userPrivateKey) {
      const unwrapped = await unwrapDocumentKey(existingRecord, this.userPrivateKey);
      this.setDocumentKey(documentId, unwrapped);
      return unwrapped;
    }

    // 2. If we are creating or in standalone mode, generate a new DK
    if (isCreator || !existingRecord) {
      const newDk = await generateDocumentKey();
      this.setDocumentKey(documentId, newDk);
      return newDk;
    }

    throw new Error("Unable to decrypt document key: missing user private key or valid wrapped DK");
  }

  /**
   * Generates a local fallback document key deterministically or randomly for offline/local mode
   */
  public async getLocalFallbackDocumentKey(documentId: string): Promise<CryptoKey> {
    const cached = this.getDocumentKey(documentId);
    if (cached) return cached;

    // Use local storage to persist the raw key in demo/local mode
    const storageKey = `syncdocs_dk_${documentId}`;
    const stored = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;

    if (stored) {
      const dk = await importRawDocumentKey(stored);
      this.setDocumentKey(documentId, dk);
      return dk;
    }

    const dk = await generateDocumentKey();
    const raw = await exportRawKey(dk);
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, raw);
    }
    this.setDocumentKey(documentId, dk);
    return dk;
  }
}

export const cryptoVault = new CryptoVault();
