import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  stringToUtf8,
} from "./encoding";
import { WrappedKey, DocumentKeyRecord } from "@/types/crypto";

const PBKDF2_ITERATIONS = 600_000;

export async function generateUserKeypair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
}

export async function generateDocumentKey(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function deriveDocumentKeyFromId(
  documentId: string
): Promise<CryptoKey> {
  const salt = stringToUtf8(`syncdocs-room-salt-${documentId}`);
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    stringToUtf8(`syncdocs-secret-passphrase-${documentId}`) as unknown as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: 100_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("spki", key);
  return arrayBufferToBase64(exported);
}

export async function importPublicKey(base64: string): Promise<CryptoKey> {
  const buffer = base64ToArrayBuffer(base64);
  return await window.crypto.subtle.importKey(
    "spki",
    buffer as unknown as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  return arrayBufferToBase64(exported);
}

export async function importRawDocumentKey(base64: string): Promise<CryptoKey> {
  const buffer = base64ToArrayBuffer(base64);
  return await window.crypto.subtle.importKey(
    "raw",
    buffer as unknown as BufferSource,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function deriveMasterKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const pwBytes = stringToUtf8(password);
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    pwBytes as unknown as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapPrivateKey(
  privateKey: CryptoKey,
  masterKey: CryptoKey,
  salt: Uint8Array
): Promise<WrappedKey> {
  const pkcs8 = await window.crypto.subtle.exportKey("pkcs8", privateKey);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    masterKey,
    pkcs8 as unknown as BufferSource
  );

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv),
    salt: arrayBufferToBase64(salt),
  };
}

export async function unwrapPrivateKey(
  wrapped: WrappedKey,
  masterKey: CryptoKey
): Promise<CryptoKey> {
  const iv = base64ToArrayBuffer(wrapped.iv);
  const ciphertext = base64ToArrayBuffer(wrapped.ciphertext);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    masterKey,
    ciphertext as unknown as BufferSource
  );

  return await window.crypto.subtle.importKey(
    "pkcs8",
    decrypted as unknown as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
}

export async function wrapDocumentKeyForUser(
  documentKey: CryptoKey,
  recipientPublicKey: CryptoKey,
  documentId: string,
  userId: string
): Promise<DocumentKeyRecord> {
  const ephemeralKeyPair = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );

  const sharedWrappingKey = await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: recipientPublicKey },
    ephemeralKeyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const rawDk = await window.crypto.subtle.exportKey("raw", documentKey);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedDk = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    sharedWrappingKey,
    rawDk as unknown as BufferSource
  );

  const ephemeralPublicKeySpki = await window.crypto.subtle.exportKey(
    "spki",
    ephemeralKeyPair.publicKey
  );

  return {
    documentId,
    userId,
    wrappedDk: arrayBufferToBase64(encryptedDk),
    iv: arrayBufferToBase64(iv),
    ephemeralPublicKey: arrayBufferToBase64(ephemeralPublicKeySpki),
  };
}

export async function unwrapDocumentKey(
  wrappedRecord: { wrappedDk: string; iv: string; ephemeralPublicKey?: string },
  recipientPrivateKey: CryptoKey
): Promise<CryptoKey> {
  if (!wrappedRecord.ephemeralPublicKey) {
    throw new Error("Missing ephemeral public key for ECDH unwrap");
  }

  const ephemeralPublicKey = await importPublicKey(
    wrappedRecord.ephemeralPublicKey
  );

  const sharedWrappingKey = await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: ephemeralPublicKey },
    recipientPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const iv = base64ToArrayBuffer(wrappedRecord.iv);
  const ciphertext = base64ToArrayBuffer(wrappedRecord.wrappedDk);

  const rawDk = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    sharedWrappingKey,
    ciphertext as unknown as BufferSource
  );

  return await window.crypto.subtle.importKey(
    "raw",
    rawDk as unknown as BufferSource,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
