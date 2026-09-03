import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  stringToUtf8,
  utf8ToString,
} from "./encoding";
import { EncryptedPayload } from "@/types/crypto";

export async function encryptBytes(
  data: Uint8Array,
  key: CryptoKey
): Promise<EncryptedPayload> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    data as unknown as BufferSource
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv),
  };
}

export async function decryptBytes(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<Uint8Array> {
  const iv = base64ToArrayBuffer(payload.iv);
  const ciphertext = base64ToArrayBuffer(payload.ciphertext);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource
  );

  return new Uint8Array(decryptedBuffer);
}

export async function encryptString(
  text: string,
  key: CryptoKey
): Promise<EncryptedPayload> {
  const bytes = stringToUtf8(text);
  return await encryptBytes(bytes, key);
}

export async function decryptString(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<string> {
  const bytes = await decryptBytes(payload, key);
  return utf8ToString(bytes);
}

export async function encryptJson(
  data: any,
  key: CryptoKey
): Promise<EncryptedPayload> {
  const jsonStr = JSON.stringify(data);
  return await encryptString(jsonStr, key);
}

export async function decryptJson<T = any>(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<T> {
  const jsonStr = await decryptString(payload, key);
  return JSON.parse(jsonStr) as T;
}
